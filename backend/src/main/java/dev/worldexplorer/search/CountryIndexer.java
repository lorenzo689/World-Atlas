package dev.worldexplorer.search;

import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.country.CountrySeeder.CountriesSeeded;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.geo.GeoPoint;
import org.springframework.data.elasticsearch.core.index.AliasAction;
import org.springframework.data.elasticsearch.core.index.AliasActionParameters;
import org.springframework.data.elasticsearch.core.index.AliasActions;
import org.springframework.data.elasticsearch.core.index.AliasData;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Keeps the country search in sync with PostgreSQL – <b>without downtime</b>.
 *
 * <p>{@code countries} is not an index but an <em>alias</em>. A rebuild
 * <ol>
 *   <li>creates a new index {@code countries-<timestamp>} with settings and mapping from {@link CountryDocument},
 *   <li>bulk-indexes all countries into it,
 *   <li>switches the alias from the old to the new index in <b>one atomic</b> {@code _aliases} call,
 *   <li>deletes the old index.
 * </ol>
 * Searches use the alias and therefore always see a complete index – the old one until the switch,
 * the new one afterwards. (Deleting and refilling one index would briefly return no results.)
 */
@Component
public class CountryIndexer {

    private static final Logger log = LoggerFactory.getLogger(CountryIndexer.class);
    static final String ALIAS = "countries";

    private final CountrySearchRepository index;
    private final CountryCatalog catalog;
    private final ElasticsearchOperations es;

    public CountryIndexer(CountrySearchRepository index, CountryCatalog catalog, ElasticsearchOperations es) {
        this.index = index;
        this.catalog = catalog;
        this.es = es;
    }

    /** Retries for a while, because Elasticsearch may still be starting when the application is. */
    @Async
    @EventListener
    public void onSeeded(CountriesSeeded event) {
        for (int attempt = 1; attempt <= 30; attempt++) {
            try {
                if (event.fresh() || aliasTargets().isEmpty() || index.count() != event.count()) reindex();
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

    public synchronized int reindex() {
        String name = ALIAS + "-" + System.currentTimeMillis();
        IndexCoordinates target = IndexCoordinates.of(name);
        IndexOperations model = es.indexOps(CountryDocument.class);
        IndexOperations created = es.indexOps(target);
        created.create(model.createSettings(), model.createMapping());

        List<CountryDocument> docs = catalog.all().stream().map(CountryIndexer::toDocument).toList();
        es.save(docs, target);
        created.refresh();

        Set<String> previous = aliasTargets();
        // an older version of the app created a real index called "countries" – it must go before the
        // alias can take that name (only happens once, on upgrade)
        IndexOperations legacy = es.indexOps(IndexCoordinates.of(ALIAS));
        if (previous.isEmpty() && legacy.exists()) legacy.delete();

        AliasActions actions = new AliasActions(new AliasAction.Add(
                AliasActionParameters.builder().withIndices(name).withAliases(ALIAS).build()));
        for (String old : previous) {
            actions.add(new AliasAction.Remove(AliasActionParameters.builder().withIndices(old).withAliases(ALIAS).build()));
        }
        created.alias(actions);
        previous.forEach(old -> es.indexOps(IndexCoordinates.of(old)).delete());
        log.info("Indexed {} countries into {} and switched alias '{}' (previous: {})", docs.size(), name, ALIAS, previous);
        return docs.size();
    }

    /** Indices the alias currently points to (empty if the alias does not exist yet). */
    Set<String> aliasTargets() {
        try {
            Map<String, Set<AliasData>> byIndex = es.indexOps(IndexCoordinates.of(ALIAS)).getAliases(ALIAS);
            return byIndex.keySet();
        } catch (Exception e) {
            return Set.of();
        }
    }

    static CountryDocument toDocument(Country c) {
        GeoPoint location = c.getLat() == null || c.getLng() == null ? null : new GeoPoint(c.getLat(), c.getLng());
        return new CountryDocument(c.getCode(), c.getCode2(), c.getName(), c.getOfficialName(), c.getCapitals(),
                c.getRegion(), c.getSubregion(), c.getLanguages(),
                c.getCurrencies().stream().map(x -> x.name() + " " + x.code()).toList(),
                c.getFlagEmoji(), c.getAreaKm2(), location);
    }
}
