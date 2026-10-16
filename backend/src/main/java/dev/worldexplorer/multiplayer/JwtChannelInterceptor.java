package dev.worldexplorer.multiplayer;

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

    public JwtChannelInterceptor(JwtDecoder decoder, JwtAuthenticationConverter converter) {
        this.decoder = decoder;
        this.converter = converter;
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
                throw new MessageDeliveryException("Invalid token: " + e.getMessage());
            }
        } else if (accessor.getUser() == null
                && (StompCommand.SEND.equals(accessor.getCommand()) || StompCommand.SUBSCRIBE.equals(accessor.getCommand()))) {
            throw new MessageDeliveryException("Not authenticated");
        }
        return message;
    }
}
