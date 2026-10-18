package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.redis.RedisJson;
import java.time.Instant;
import java.util.UUID;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Authenticates WebSocket clients.
 *
 * <p>Browsers cannot set an {@code Authorization} header on the WebSocket handshake, so the JWT is sent
 * in the STOMP {@code CONNECT} frame instead ({@code Authorization: Bearer <token>} native header).
 * It is verified with the same {@link JwtDecoder} as HTTP requests and becomes the session's user;
 * the principal name is the user id, which is what {@code /user/...} destinations resolve against.
 * Frames other than CONNECT are only accepted from authenticated sessions.
 */
@Component
public class JwtChannelInterceptor implements ChannelInterceptor {

    private final JwtDecoder decoder;
    private final JwtAuthenticationConverter converter;
    private final RedisJson rooms;

    public JwtChannelInterceptor(JwtDecoder decoder, JwtAuthenticationConverter converter, RedisJson rooms) {
        this.decoder = decoder;
        this.converter = converter;
        this.rooms = rooms;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                throw new MessageDeliveryException("Missing bearer token");
            }
            try {
                Jwt jwt = decoder.decode(header.substring(7));
                AbstractAuthenticationToken auth = converter.convert(jwt);
                accessor.setUser(auth);
            } catch (JwtException e) {
                throw new MessageDeliveryException("Invalid token");
            }
        } else if (StompCommand.SEND.equals(accessor.getCommand()) || StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            if (!(accessor.getUser() instanceof JwtAuthenticationToken user)
                    || user.getToken().getExpiresAt() == null
                    || !user.getToken().getExpiresAt().isAfter(Instant.now())) {
                throw new MessageDeliveryException("Not authenticated");
            }
            String destination = accessor.getDestination();
            if (StompCommand.SEND.equals(accessor.getCommand())) {
                if (destination == null || !destination.matches("/app/rooms/[A-Z2-9]{5}/(answer|chat)")) {
                    throw new MessageDeliveryException("Destination not allowed");
                }
            } else if (destination == null || !(destination.equals("/user/queue/match")
                    || destination.equals("/user/queue/errors") || roomSubscriptionAllowed(destination, user))) {
                throw new MessageDeliveryException("Subscription not allowed");
            }
        }
        return message;
    }

    private boolean roomSubscriptionAllowed(String destination, JwtAuthenticationToken user) {
        if (!destination.matches("/topic/rooms/[A-Z2-9]{5}")) return false;
        String code = destination.substring("/topic/rooms/".length());
        UUID userId;
        try {
            userId = UUID.fromString(user.getToken().getSubject());
        } catch (IllegalArgumentException e) {
            return false;
        }
        return rooms.get("room:" + code, Room.class).map(room -> room.has(userId)).orElse(false);
    }
}
