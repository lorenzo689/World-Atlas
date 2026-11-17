package dev.worldexplorer.country;

import static dev.worldexplorer.common.config.CacheConfig.typed;

import dev.worldexplorer.common.config.CacheNames;
import dev.worldexplorer.country.CountryDtos.CountryDetail;
import dev.worldexplorer.country.CountryDtos.CountryList;
import java.time.Duration;
import org.springframework.boot.cache.autoconfigure.RedisCacheManagerBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/** Redis caches for country data (see {@code CacheConfig} for the serialization rules). */
@Configuration
class CountryCacheConfig {

    @Bean
    RedisCacheManagerBuilderCustomizer countryCaches(JsonMapper json) {
        return builder -> builder
                .withCacheConfiguration(CacheNames.COUNTRY_LIST, typed(json, CountryList.class, Duration.ofHours(6)))
                .withCacheConfiguration(CacheNames.COUNTRY_DETAIL, typed(json, CountryDetail.class, Duration.ofHours(6)));
    }
}
