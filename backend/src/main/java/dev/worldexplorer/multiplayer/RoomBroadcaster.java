package dev.worldexplorer.multiplayer;

import dev.worldexplorer.multiplayer.RoomDtos.RoomEvent;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Sends WebSocket messages <em>via Redis pub/sub</em> instead of directly.
 *
 * <p>Why: each backend instance only knows its own WebSocket connections. If player A is connected to
 * instance 1 and player B to instance 2, a message created on instance 1 must also reach instance 2.
 * Every instance publishes to the Redis channels below and every instance subscribes to them
 * ({@link RedisWebSocketRelay}) and forwards to its local STOMP broker. With one instance this costs a
 * round trip to Redis; with many it is what makes horizontal scaling work.
 */
@Component
public class RoomBroadcaster {

    static final String ROOM_CHANNEL = "ws:room";
    static final String USER_CHANNEL = "ws:user";

    /** Envelope on the Redis channel. {@code payload} is the JSON that goes to the browser unchanged. */
    record Envelope(String target, String destination, String payload) {}

    private final StringRedisTemplate redis;
    private final JsonMapper json;

    public RoomBroadcaster(StringRedisTemplate redis, JsonMapper json) {
        this.redis = redis;
        this.json = json;
    }

    /** To everybody subscribed to {@code /topic/rooms/<code>}. */
    public void toRoom(String code, String type, Object data) {
        String payload = json.writeValueAsString(RoomEvent.of(type, data));
        redis.convertAndSend(ROOM_CHANNEL, json.writeValueAsString(new Envelope(code, "/topic/rooms/" + code, payload)));
    }

    /** To one user's private queue, e.g. {@code /user/queue/match}. */
    public void toUser(UUID userId, String queue, String type, Object data) {
        String payload = json.writeValueAsString(RoomEvent.of(type, data));
        redis.convertAndSend(USER_CHANNEL, json.writeValueAsString(new Envelope(userId.toString(), queue, payload)));
    }
}
