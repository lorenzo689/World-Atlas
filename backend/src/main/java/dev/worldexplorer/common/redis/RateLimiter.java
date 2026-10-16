package dev.worldexplorer.common.redis;

import java.time.Duration;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * Fixed-window rate limiter on Redis.
 *
 * <p>For every (bucket, window) there is one counter key, e.g. {@code rl:auth:203.0.113.7:28934211}.
 * A Lua script increments it and sets the expiry on the first hit – atomically, so concurrent
 * requests cannot both see "first hit" or leave a counter without expiry.
 */
@Component
public class RateLimiter {

    private static final RedisScript<Long> INCREMENT = RedisScript.of("""
            local c = redis.call('INCR', KEYS[1])
            if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return c
            """, Long.class);

    private final StringRedisTemplate redis;

    public RateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** @return the decision for this hit (allowed + how many remain + seconds until reset) */
    public Decision hit(String bucket, String subject, int limit, Duration window) {
        long windowMs = window.toMillis();
        long now = System.currentTimeMillis();
        long windowIndex = now / windowMs;
        String key = "rl:" + bucket + ":" + subject + ":" + windowIndex;
        Long count = redis.execute(INCREMENT, List.of(key), String.valueOf(windowMs));
        long used = count == null ? 0 : count;
        long resetSeconds = Math.max(1, ((windowIndex + 1) * windowMs - now) / 1000);
        return new Decision(used <= limit, Math.max(0, limit - used), resetSeconds, limit);
    }

    public record Decision(boolean allowed, long remaining, long resetSeconds, int limit) {}
}
