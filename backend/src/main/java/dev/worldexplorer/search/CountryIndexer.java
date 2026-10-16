package dev.worldexplorer.search;

import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.country.CountrySeeder.CountriesSeeded;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.data.elasticsearch.core.geo.GeoPoint;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Keeps the {@code countries} index in sync with PostgreSQL. Countries only change when they are
 * (re)seeded, so a full reindex on that event is simplest. It runs asynchronously so that a slow or
 * unavailable Elasticsearch never blocks application startup.
 */
@Component
public class CountryIndexer {

    private static final Logger log = LoggerFactory.getLogger(CountryIndexer.class);

    private final CountrySearchRepository index;
    private final CountryCatalog catalog;
    private final IndexBootstrap indices;

    public CountryIndexer(CountrySearchRepository index, CountryCatalog catalog, IndexBootstrap indices) {
        this.index = index;
        this.catalog = catalog;
        this.indices = indices;
    }

    /** Retries for a while, because Elasticsearch may still be starting when the application is. */
    @Async
    @EventListener
    public void onSeeded(CountriesSeeded event) {
        for (int attempt = 1; attempt <= 30; attempt++) {
            try {
                indices.ensure(CountryDocument.class);
                if (event.fresh() || index.count() != event.count()) reindex();
                return;
            } catch (Exception e) {
                log.info("Country index not ready yet (attempt {}): {}", attempt, e.getMessage());
                try {
                    Thread.sleep(Math.min(10_000, 1_000L * attempt));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
        log.warn("Country search index not updated: Elasticsearch unavailable");
    }

    public int reindex() {
        indices.ensure(CountryDocument.class);
        List<CountryDocument> docs = catalog.all().stream().map(CountryIndexer::toDocument).toList();
        index.deleteAll();
        index.saveAll(docs);
        log.info("Indexed {} countries into Elasticsearch", docs.size());
        return docs.size();
    }

    static CountryDocument toDocument(Country c) {
        GeoPoint location = c.getLat() == null || c.getLng() == null ? null : new GeoPoint(c.getLat(), c.getLng());
        return new CountryDocument(c.getCode(), c.getCode2(), c.getName(), c.getOfficialName(), c.getCapitals(),
                c.getRegion(), c.getSubregion(), c.getLanguages(),
                c.getCurrencies().stream().map(x -> x.name() + " " + x.code()).toList(),
                c.getFlagEmoji(), c.getAreaKm2(), location);
    }
}
