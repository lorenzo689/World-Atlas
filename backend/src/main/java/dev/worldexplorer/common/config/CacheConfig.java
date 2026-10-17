package dev.worldexplorer.common.config;

import dev.worldexplorer.country.CountryDtos.CountryDetail;
import dev.worldexplorer.country.CountryDtos.CountryList;
import dev.worldexplorer.indicator.IndicatorDtos.Catalog;
import dev.worldexplorer.indicator.IndicatorDtos.LatestValues;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorStats;
import java.time.Duration;
import org.springframework.boot.cache.autoconfigure.RedisCacheManagerBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;
import tools.jackson.databind.json.JsonMapper;

/**
 * Redis cache configuration.
 *
 * <p>Each cache gets a serializer bound to its value type. That keeps the JSON in Redis free of class
 * names and avoids the classic pitfall of generic serializers turning records into LinkedHashMaps.
 * Key format in Redis: {@code we::<cache>::<key>}.
 */
@Configuration
public class CacheConfig {

    @Bean
    RedisCacheManagerBuilderCustomizer cacheCustomizer(JsonMapper json) {
        return builder -> builder
                .withCacheConfiguration(CacheNames.COUNTRY_LIST, typed(json, CountryList.class, Duration.ofHours(6)))
                .withCacheConfiguration(CacheNames.COUNTRY_DETAIL, typed(json, CountryDetail.class, Duration.ofHours(6)))
                .withCacheConfiguration(CacheNames.INDICATOR_LATEST, typed(json, LatestValues.class, Duration.ofHours(12)))
                .withCacheConfiguration(CacheNames.INDICATOR_STATS, typed(json, IndicatorStats.class, Duration.ofHours(12)))
                .withCacheConfiguration(CacheNames.INDICATOR_CATALOG, typed(json, Catalog.class, Duration.ofMinutes(30)))
                .withCacheConfiguration(CacheNames.INDICATOR_AT, typed(json, LatestValues.class, Duration.ofHours(12)));
    }

    private static <T> RedisCacheConfiguration typed(JsonMapper json, Class<T> type, Duration ttl) {
        return RedisCacheConfiguration.defaultCacheConfig()
                .prefixCacheNameWith("we::")
                .entryTtl(ttl)
                .disableCachingNullValues()
                .serializeValuesWith(SerializationPair.fromSerializer(new JacksonJsonRedisSerializer<>(json, type)));
    }
}
