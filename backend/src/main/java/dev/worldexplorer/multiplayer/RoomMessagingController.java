package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.redis.RateLimiter;
import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.multiplayer.RoomDtos.AnswerMessage;
import dev.worldexplorer.multiplayer.RoomDtos.ChatMessage;
import java.security.Principal;
import java.time.Duration;
import java.util.Map;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * STOMP message handlers: {@code SEND /app/rooms/ABCDE/answer} ends up in {@link #answer}.
 * Errors are sent back privately to {@code /user/queue/errors}.
 */
@Controller
public class RoomMessagingController {

    private final RoomService rooms;
    private final MatchmakingService matchmaking;
    private final RateLimiter limiter;

    public RoomMessagingController(RoomService rooms, MatchmakingService matchmaking, RateLimiter limiter) {
        this.rooms = rooms;
        this.matchmaking = matchmaking;
        this.limiter = limiter;
    }

    @MessageMapping("/rooms/{code}/answer")
    public void answer(@DestinationVariable String code, @Payload AnswerMessage msg, Principal principal) {
        rooms.answer(code.toUpperCase(), user(principal), msg.round(), msg.answer());
    }

    @MessageMapping("/rooms/{code}/chat")
    public void chat(@DestinationVariable String code, @Payload ChatMessage msg, Principal principal) {
        AuthUser user = user(principal);
        if (!limiter.hit("chat", user.id().toString(), 10, Duration.ofSeconds(10)).allowed()) {
            throw ApiException.tooManyRequests("Slow down a little.");
        }
        rooms.chat(code.toUpperCase(), user, msg.text());
    }

    @MessageExceptionHandler(ApiException.class)
    @SendToUser("/queue/errors")
    public Map<String, String> onError(ApiException e) {
        return Map.of("code", e.code(), "message", e.getMessage());
    }

    /** Browser tab closed or network lost: mark the player offline and leave the matchmaking queue. */
    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        AuthUser user = event.getUser() instanceof Authentication a ? AuthUser.from(a) : null;
        if (user == null) return;
        matchmaking.leave(user.id());
        rooms.disconnected(user.id());
    }

    private static AuthUser user(Principal principal) {
        AuthUser user = principal instanceof Authentication a ? AuthUser.from(a) : null;
        if (user == null) throw ApiException.unauthorized("Not authenticated");
        return user;
    }
}
