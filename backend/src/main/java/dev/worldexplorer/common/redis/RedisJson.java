package dev.worldexplorer.common.redis;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stores small aggregates (quiz sessions, multiplayer rooms) as JSON strings in Redis.
 *
 * <p>Plain {@code SET}/{@code GET} with explicit (de)serialisation keeps it obvious what is stored:
 * {@code redis-cli GET quiz:session:<id>} shows readable JSON.
 */
@Component
public class RedisJson {

    private final StringRedisTemplate redis;
    private final JsonMapper json;

    public RedisJson(StringRedisTemplate redis, JsonMapper json) {
        this.redis = redis;
        this.json = json;
    }

    public <T> Optional<T> get(String key, Class<T> type) {
        String raw = redis.opsForValue().get(key);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw, type));
    }

    public void set(String key, Object value, Duration ttl) {
        redis.opsForValue().set(key, json.writeValueAsString(value), ttl);
    }

    public void delete(String key) {
        redis.delete(key);
    }
}
