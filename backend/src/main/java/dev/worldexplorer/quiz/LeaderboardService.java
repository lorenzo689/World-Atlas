package dev.worldexplorer.quiz;

import dev.worldexplorer.common.error.ApiException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations.TypedTuple;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

/**
 * Leaderboards as Redis sorted sets (ZSET): member = user id, score = points. Redis keeps them sorted,
 * so "top 10" ({@code ZREVRANGE}) and "my rank" ({@code ZREVRANK}) are O(log n) – no SQL ORDER BY over
 * all results.
 *
 * <ul>
 *   <li>{@code lb:alltime}, {@code lb:weekly:2026-W42}, {@code lb:daily:2026-10-16} – best single game
 *   <li>{@code lb:mp:wins} – multiplayer wins (incremented)
 *   <li>{@code lb:names} – hash user id → display name, so rendering needs no database
 * </ul>
 */
@Service
public class LeaderboardService {

    public enum Period { ALLTIME, WEEKLY, DAILY, MULTIPLAYER }

    public record Entry(int rank, UUID userId, String name, long score) {}

    public record Board(Period period, String key, List<Entry> top, Entry me) {}

    /** Set the score only if it beats the stored one (like ZADD GT, but explicit). */
    private static final RedisScript<Long> SET_IF_HIGHER = RedisScript.of("""
            local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
            if (not current) or tonumber(ARGV[2]) > tonumber(current) then
              redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
              if tonumber(ARGV[3]) > 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
              return 1
            end
            return 0
            """, Long.class);

    private final StringRedisTemplate redis;

    public LeaderboardService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void recordGame(UUID userId, String name, int score, boolean daily, LocalDate dailyDate) {
        redis.opsForHash().put("lb:names", userId.toString(), name);
        if (daily) {
            setIfHigher("lb:daily:" + dailyDate, userId, score, Duration.ofDays(8));
        } else {
            setIfHigher("lb:alltime", userId, score, null);
            setIfHigher(weeklyKey(LocalDate.now(ZoneOffset.UTC)), userId, score, Duration.ofDays(15));
        }
    }

    public void recordWin(UUID userId, String name) {
        redis.opsForHash().put("lb:names", userId.toString(), name);
        redis.opsForZSet().incrementScore("lb:mp:wins", userId.toString(), 1);
    }

    public Board board(Period period, int limit, UUID me) {
        String key = key(period);
        int n = Math.max(1, Math.min(limit, 100));
        Set<TypedTuple<String>> tuples = redis.opsForZSet().reverseRangeWithScores(key, 0, n - 1);
        List<Entry> top = new ArrayList<>();
        if (tuples != null) {
            List<Object> ids = tuples.stream().map(t -> (Object) t.getValue()).toList();
            List<Object> names = ids.isEmpty() ? List.of() : redis.opsForHash().multiGet("lb:names", ids);
            int i = 0;
            for (TypedTuple<String> t : tuples) {
                Object name = names.get(i);
                top.add(new Entry(i + 1, UUID.fromString(t.getValue()), name == null ? "?" : name.toString(),
                        t.getScore() == null ? 0 : t.getScore().longValue()));
                i++;
            }
        }
        return new Board(period, key, top, me == null ? null : entryFor(key, me));
    }

    private Entry entryFor(String key, UUID userId) {
        Long rank = redis.opsForZSet().reverseRank(key, userId.toString());
        if (rank == null) return null;
        Double score = redis.opsForZSet().score(key, userId.toString());
        Object name = redis.opsForHash().get("lb:names", userId.toString());
        return new Entry(rank.intValue() + 1, userId, name == null ? "?" : name.toString(),
                score == null ? 0 : score.longValue());
    }

    /** 1-based rank of a user, or null. */
    public Integer rank(Period period, UUID userId) {
        Entry e = entryFor(key(period), userId);
        return e == null ? null : e.rank();
    }

    private void setIfHigher(String key, UUID userId, int score, Duration ttl) {
        redis.execute(SET_IF_HIGHER, List.of(key), userId.toString(), String.valueOf(score),
                String.valueOf(ttl == null ? 0 : ttl.toSeconds()));
    }

    static String key(Period period) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return switch (period) {
            case ALLTIME -> "lb:alltime";
            case WEEKLY -> weeklyKey(today);
            case DAILY -> "lb:daily:" + today;
            case MULTIPLAYER -> "lb:mp:wins";
        };
    }

    static String weeklyKey(LocalDate date) {
        return "lb:weekly:%d-W%02d".formatted(date.get(IsoFields.WEEK_BASED_YEAR), date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }

    public static Period parse(String period) {
        try {
            return Period.valueOf(period.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_period", "period must be alltime, weekly, daily or multiplayer");
        }
    }
}
