package dev.worldexplorer.common.config;

import java.time.Duration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;
import tools.jackson.databind.json.JsonMapper;

/**
 * Redis cache configuration helper.
 *
 * <p>Each cache gets a serializer bound to its value type. That keeps the JSON in Redis free of class
 * names and avoids the classic pitfall of generic serializers turning records into LinkedHashMaps.
 * Key format in Redis: {@code we::<cache>::<key>}.
 *
 * <p>The caches themselves are registered by the modules that own their value types
 * ({@code CountryCacheConfig}, {@code IndicatorCacheConfig}), each with its own
 * {@code RedisCacheManagerBuilderCustomizer} bean; Spring Boot applies all of them. Keeping the value
 * types out of here means {@code common} does not depend on feature modules.
 */
public final class CacheConfig {

    private CacheConfig() {}

    /** A cache whose values are JSON of exactly {@code type}, expiring after {@code ttl}. */
    public static <T> RedisCacheConfiguration typed(JsonMapper json, Class<T> type, Duration ttl) {
        return RedisCacheConfiguration.defaultCacheConfig()
                .prefixCacheNameWith("we::")
                .entryTtl(ttl)
                .disableCachingNullValues()
                .serializeValuesWith(SerializationPair.fromSerializer(new JacksonJsonRedisSerializer<>(json, type)));
    }
}
