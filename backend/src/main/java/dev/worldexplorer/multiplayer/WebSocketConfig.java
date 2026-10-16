package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.config.AppProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP over WebSocket.
 *
 * <ul>
 *   <li>Endpoint {@code /ws} (plain WebSocket, no SockJS fallback).
 *   <li>Clients send to {@code /app/...} (handled by {@code @MessageMapping} methods).
 *   <li>Clients subscribe to {@code /topic/rooms/<code>} (room broadcast) and {@code /user/queue/...}
 *       (private messages; Spring maps them to the connected user's sessions).
 *   <li>The in-memory "simple broker" with heartbeats (10 s) detects dead connections.
 *   <li>Every frame passes the {@link JwtChannelInterceptor} – authentication happens on CONNECT.
 * </ul>
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtChannelInterceptor jwtInterceptor;
    private final AppProperties props;

    public WebSocketConfig(JwtChannelInterceptor jwtInterceptor, AppProperties props) {
        this.jwtInterceptor = jwtInterceptor;
        this.props = props;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns(props.cors().allowedOrigins().toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        ThreadPoolTaskScheduler heartbeat = new ThreadPoolTaskScheduler();
        heartbeat.setPoolSize(1);
        heartbeat.setThreadNamePrefix("ws-heartbeat-");
        heartbeat.initialize();
        registry.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[] {10_000, 10_000})
                .setTaskScheduler(heartbeat);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(jwtInterceptor);
    }
}
