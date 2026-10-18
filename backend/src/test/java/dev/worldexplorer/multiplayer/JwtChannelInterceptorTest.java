package dev.worldexplorer.multiplayer;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.worldexplorer.common.redis.RedisJson;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class JwtChannelInterceptorTest {
    private final RedisJson rooms = mock(RedisJson.class);
    private final JwtChannelInterceptor interceptor = new JwtChannelInterceptor(
            mock(JwtDecoder.class), mock(JwtAuthenticationConverter.class), rooms);
    private final UUID userId = UUID.randomUUID();

    @Test
    void rejectsBrokerDestinationsAndNonMembers() {
        var user = token(Instant.now().plusSeconds(60));
        assertThatThrownBy(() -> interceptor.preSend(frame("/topic/rooms/ABCDE", user), null))
                .isInstanceOf(MessageDeliveryException.class);
        assertThatThrownBy(() -> interceptor.preSend(frame("/queue/match", user), null))
                .isInstanceOf(MessageDeliveryException.class);
        assertThatCode(() -> interceptor.preSend(frame("/user/queue/match", user), null)).doesNotThrowAnyException();
        assertThatCode(() -> interceptor.preSend(frame("/user/queue/notifications", user), null)).doesNotThrowAnyException();
    }

    @Test
    void permitsOnlyMembersWithUnexpiredTokens() {
        Room room = new Room("ABCDE", userId, new Room.Settings(5, List.of(), null, 15), false);
        room.players.put(userId.toString(), new Room.Player(userId, "Player"));
        when(rooms.get("room:ABCDE", Room.class)).thenReturn(Optional.of(room));
        assertThatCode(() -> interceptor.preSend(frame("/topic/rooms/ABCDE", token(Instant.now().plusSeconds(60))), null))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> interceptor.preSend(frame("/topic/rooms/ABCDE", token(Instant.now().minusSeconds(1))), null))
                .isInstanceOf(MessageDeliveryException.class);
    }

    private JwtAuthenticationToken token(Instant expires) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "HS256")
                .subject(userId.toString()).issuedAt(Instant.now().minusSeconds(60)).expiresAt(expires).build();
        return new JwtAuthenticationToken(jwt);
    }

    private static Message<byte[]> frame(String destination, JwtAuthenticationToken user) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        headers.setDestination(destination);
        headers.setUser(user);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }
}
