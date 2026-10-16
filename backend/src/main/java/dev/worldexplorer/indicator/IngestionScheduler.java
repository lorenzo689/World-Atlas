package dev.worldexplorer.indicator;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.events.IndicatorIngested;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.common.config.CacheNames;
import dev.worldexplorer.country.CountrySeeder.CountriesSeeded;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.event.EventListener;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * When ingestion happens:
 * <ul>
 *   <li>once at startup if the database has no indicator data yet (needs internet access)
 *   <li>every Sunday at 03:00 (cron) to pick up new World Bank releases
 *   <li>manually via {@code POST /api/admin/ingestion}
 * </ul>
 * It also listens to {@code indicator.ingested} to evict the Redis caches of that indicator.
 */
@Component
public class IngestionScheduler {

    private static final Logger log = LoggerFactory.getLogger(IngestionScheduler.class);

    private final IngestionService ingestion;
    private final IndicatorValueRepository values;
    private final CacheManager caches;
    private final AppProperties.Ingestion config;

    public IngestionScheduler(IngestionService ingestion, IndicatorValueRepository values, CacheManager caches,
            AppProperties props) {
        this.ingestion = ingestion;
        this.values = values;
        this.caches = caches;
        this.config = props.ingestion();
    }

    /** Runs after the countries are seeded (ingestion filters rows by known country codes). */
    @EventListener
    public void bootstrap(CountriesSeeded event) {
        if (config.bootstrapOnStartup() && values.count() == 0) {
            log.info("No indicator data yet – starting the initial ingestion of all indicators");
            ingestion.triggerAll(IngestionRun.Trigger.BOOTSTRAP);
        }
    }

    @Scheduled(cron = "0 0 3 * * SUN")
    public void weekly() {
        if (config.scheduleEnabled()) ingestion.triggerAll(IngestionRun.Trigger.SCHEDULED);
    }

    @KafkaListener(id = "indicator-cache-evictor", topics = Topics.INDICATOR_INGESTED, groupId = "indicator-cache")
    public void evict(IndicatorIngested event) {
        if (!event.success()) return;
        for (String name : new String[] {CacheNames.INDICATOR_LATEST, CacheNames.INDICATOR_STATS}) {
            Cache cache = caches.getCache(name);
            if (cache != null) cache.evict(event.indicatorKey());
        }
        Cache catalog = caches.getCache(CacheNames.INDICATOR_CATALOG);
        if (catalog != null) catalog.evict("all");
    }
}
