package dev.worldexplorer.common.redis;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * A minimal distributed lock on Redis (single node).
 *
 * <p>Acquire: {@code SET key token NX PX ttl} – only one caller can create the key.
 * Release: a Lua script deletes the key only if it still holds <em>our</em> token, so a caller whose
 * lock already expired can never delete somebody else's lock. The TTL guarantees that a crashed
 * holder does not block everybody forever.
 *
 * <p>Used for: one ingestion run per indicator across instances, serialising updates to a
 * multiplayer room or a quiz session.
 */
@Component
public class RedisLock {

    private static final RedisScript<Long> RELEASE = RedisScript.of(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            Long.class);

    private final StringRedisTemplate redis;

    public RedisLock(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Try once. Returns the token needed to release, or empty if someone else holds the lock. */
    public Optional<String> tryAcquire(String key, Duration ttl) {
        String token = UUID.randomUUID().toString();
        Boolean ok = redis.opsForValue().setIfAbsent("lock:" + key, token, ttl);
        return Boolean.TRUE.equals(ok) ? Optional.of(token) : Optional.empty();
    }

    public void release(String key, String token) {
        redis.execute(RELEASE, List.of("lock:" + key), token);
    }

    /**
     * Runs {@code action} while holding the lock, retrying for up to {@code wait}.
     * Throws {@link LockUnavailableException} if the lock could not be obtained in time.
     */
    public <T> T withLock(String key, Duration ttl, Duration wait, Supplier<T> action) {
        long deadline = System.nanoTime() + wait.toNanos();
        while (true) {
            Optional<String> token = tryAcquire(key, ttl);
            if (token.isPresent()) {
                try {
                    return action.get();
                } finally {
                    release(key, token.get());
                }
            }
            if (System.nanoTime() > deadline) throw new LockUnavailableException(key);
            try {
                Thread.sleep(15);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new LockUnavailableException(key);
            }
        }
    }

    public void withLock(String key, Duration ttl, Duration wait, Runnable action) {
        withLock(key, ttl, wait, () -> {
            action.run();
            return null;
        });
    }

    public static class LockUnavailableException extends RuntimeException {
        public LockUnavailableException(String key) {
            super("Lock '" + key + "' is busy");
        }
    }
}
