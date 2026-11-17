package dev.worldexplorer.indicator;

import static dev.worldexplorer.common.config.CacheConfig.typed;

import dev.worldexplorer.common.config.CacheNames;
import dev.worldexplorer.indicator.IndicatorDtos.Catalog;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorStats;
import dev.worldexplorer.indicator.IndicatorDtos.LatestValues;
import java.time.Duration;
import org.springframework.boot.cache.autoconfigure.RedisCacheManagerBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/** Redis caches for World Bank indicator data (see {@code CacheConfig} for the serialization rules). */
@Configuration
class IndicatorCacheConfig {

    @Bean
    RedisCacheManagerBuilderCustomizer indicatorCaches(JsonMapper json) {
        return builder -> builder
                .withCacheConfiguration(CacheNames.INDICATOR_LATEST, typed(json, LatestValues.class, Duration.ofHours(12)))
                .withCacheConfiguration(CacheNames.INDICATOR_STATS, typed(json, IndicatorStats.class, Duration.ofHours(12)))
                .withCacheConfiguration(CacheNames.INDICATOR_CATALOG, typed(json, Catalog.class, Duration.ofMinutes(30)))
                .withCacheConfiguration(CacheNames.INDICATOR_AT, typed(json, LatestValues.class, Duration.ofHours(12)));
    }
}
