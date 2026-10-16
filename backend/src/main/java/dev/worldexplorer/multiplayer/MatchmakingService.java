package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.multiplayer.RoomDtos.CreateRoomRequest;
import dev.worldexplorer.multiplayer.RoomDtos.MatchFound;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * "Quick match": players wait in a Redis sorted set (score = time they joined). As soon as at least
 * two are waiting, a Lua script atomically pops up to four of them – atomic, so two instances can never
 * put the same player into two games. They get a room and a private message with its code.
 */
@Service
public class MatchmakingService {

    private static final String QUEUE = "mm:queue";
    private static final String NAMES = "mm:names";
    private static final int MAX_PER_MATCH = 4;

    /** Pops up to ARGV[1] players, but only if at least two are waiting. */
    private static final RedisScript<List> POP_MATCH = RedisScript.of("""
            if redis.call('ZCARD', KEYS[1]) < 2 then return {} end
            local popped = redis.call('ZPOPMIN', KEYS[1], ARGV[1])
            local ids = {}
            for i = 1, #popped, 2 do table.insert(ids, popped[i]) end
            return ids
            """, List.class);

    private final StringRedisTemplate redis;
    private final RoomService rooms;
    private final RoomBroadcaster broadcast;

    public MatchmakingService(StringRedisTemplate redis, RoomService rooms, RoomBroadcaster broadcast) {
        this.redis = redis;
        this.rooms = rooms;
        this.broadcast = broadcast;
    }

    public long join(AuthUser user) {
        redis.opsForZSet().addIfAbsent(QUEUE, user.id().toString(), Instant.now().toEpochMilli());
        redis.opsForHash().put(NAMES, user.id().toString(), user.name());
        tryMatch();
        Long size = redis.opsForZSet().size(QUEUE);
        return size == null ? 0 : size;
    }

    public void leave(UUID userId) {
        redis.opsForZSet().remove(QUEUE, userId.toString());
    }

    /** Also runs periodically, in case a match attempt failed or players joined on different instances. */
    @Scheduled(fixedDelay = 2000)
    @SuppressWarnings("unchecked")
    public void tryMatch() {
        List<String> ids = redis.execute(POP_MATCH, List.of(QUEUE), String.valueOf(MAX_PER_MATCH));
        if (ids == null || ids.size() < 2) return;

        List<AuthUser> players = ids.stream().map(id -> {
            Object name = redis.opsForHash().get(NAMES, id);
            return new AuthUser(UUID.fromString(id), name == null ? "Player" : name.toString(), List.of(), false);
        }).toList();

        AuthUser host = players.getFirst();
        var room = rooms.create(host, new CreateRoomRequest(6, null, null, null, false), true);
        for (AuthUser p : players.subList(1, players.size())) rooms.join(room.code(), p);
        for (AuthUser p : players) broadcast.toUser(p.id(), "/queue/match", "MATCH_FOUND", new MatchFound(room.code()));
        rooms.startMatchmade(room.code());
    }
}
