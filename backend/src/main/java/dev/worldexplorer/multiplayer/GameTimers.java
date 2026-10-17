package dev.worldexplorer.multiplayer;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Distributed timers for multiplayer rounds, stored in Redis instead of in one JVM's memory.
 *
 * <p>A timer is a member of the sorted set {@code mp:timers} with its due time (epoch ms) as score,
 * e.g. {@code END_ROUND|K7Q2X|3|1}. Every backend instance polls the set; a Lua script atomically moves
 * due timers to {@code mp:timers:inflight} (score = now + lease), so exactly one instance gets each
 * timer. After the action ran, the timer is removed from the inflight set. If the instance dies in
 * between, the lease expires and {@link #recoverExpired} puts the timer back – it will be executed
 * again, which is safe because all game actions are idempotent (they check round and game number).
 *
 * <p>Result: a game survives a restart or the crash of the instance that started it.
 */
@Component
public class GameTimers {

    private static final Logger log = LoggerFactory.getLogger(GameTimers.class);
    static final String DUE = "mp:timers";
    static final String INFLIGHT = "mp:timers:inflight";
    private static final long LEASE_MS = 15_000;

    public enum Action { START_ROUND, END_ROUND, FINISH }

    public record Timer(Action action, String room, int round, int game) {
        String member() {
            return action + "|" + room + "|" + round + "|" + game;
        }

        static Timer parse(String member) {
            String[] p = member.split("\\|");
            return new Timer(Action.valueOf(p[0]), p[1], Integer.parseInt(p[2]), Integer.parseInt(p[3]));
        }
    }

    /** Claims up to ARGV[3] timers that are due at ARGV[1]; leases them until ARGV[2]. */
    private static final RedisScript<List> CLAIM = RedisScript.of("""
            local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[3]))
            for _, m in ipairs(due) do
              redis.call('ZREM', KEYS[1], m)
              redis.call('ZADD', KEYS[2], ARGV[2], m)
            end
            return due
            """, List.class);

    /** Moves timers whose lease expired back to the due set. */
    private static final RedisScript<Long> RECOVER = RedisScript.of("""
            local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
            for _, m in ipairs(expired) do
              redis.call('ZREM', KEYS[2], m)
              redis.call('ZADD', KEYS[1], ARGV[1], m)
            end
            return #expired
            """, Long.class);

    private final StringRedisTemplate redis;
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
    private volatile Consumer<Timer> handler = t -> {};

    public GameTimers(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** The room service registers itself as the code that runs due timers. */
    void onDue(Consumer<Timer> handler) {
        this.handler = handler;
    }

    public void schedule(Action action, String room, int round, int game, Instant at) {
        redis.opsForZSet().add(DUE, new Timer(action, room, round, game).member(), at.toEpochMilli());
    }

    @Scheduled(fixedDelay = 100)
    @SuppressWarnings("unchecked")
    public void poll() {
        long now = System.currentTimeMillis();
        List<String> claimed = redis.execute(CLAIM, List.of(DUE, INFLIGHT),
                String.valueOf(now), String.valueOf(now + LEASE_MS), "50");
        if (claimed == null) return;
        for (String member : claimed) {
            workers.execute(() -> {
                try {
                    handler.accept(Timer.parse(member));
                } catch (Exception e) {
                    log.warn("Game timer {} failed: {}", member, e.getMessage());
                } finally {
                    redis.opsForZSet().remove(INFLIGHT, member);
                }
            });
        }
    }

    @Scheduled(fixedDelay = 5000)
    public void recoverExpired() {
        Long n = redis.execute(RECOVER, List.of(DUE, INFLIGHT), String.valueOf(System.currentTimeMillis()));
        if (n != null && n > 0) log.info("Recovered {} game timers from a crashed instance", n);
    }
}
