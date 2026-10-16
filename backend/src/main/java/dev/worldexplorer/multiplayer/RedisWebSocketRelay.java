package dev.worldexplorer.multiplayer;

import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.util.MimeTypeUtils;
import tools.jackson.databind.json.JsonMapper;

/**
 * Receives {@link RoomBroadcaster} messages from Redis and delivers them to this instance's WebSocket
 * clients. The payload is already JSON, so it is sent as raw bytes with {@code content-type:
 * application/json} (no second round of message conversion).
 */
@Configuration
public class RedisWebSocketRelay implements MessageListener {

    private final SimpMessagingTemplate stomp;
    private final JsonMapper json;

    public RedisWebSocketRelay(SimpMessagingTemplate stomp, JsonMapper json) {
        this.stomp = stomp;
        this.json = json;
    }

    @Bean
    RedisMessageListenerContainer webSocketRelayContainer(RedisConnectionFactory factory) {
        var container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.addMessageListener(this, new ChannelTopic(RoomBroadcaster.ROOM_CHANNEL));
        container.addMessageListener(this, new ChannelTopic(RoomBroadcaster.USER_CHANNEL));
        return container;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
        RoomBroadcaster.Envelope e = json.readValue(message.getBody(), RoomBroadcaster.Envelope.class);
        String destination = RoomBroadcaster.USER_CHANNEL.equals(channel)
                ? "/user/" + e.target() + e.destination() // resolved to the user's sessions by Spring
                : e.destination();

        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        headers.setLeaveMutable(true);
        stomp.send(destination,
                MessageBuilder.createMessage(e.payload().getBytes(StandardCharsets.UTF_8), headers.getMessageHeaders()));
    }
}
