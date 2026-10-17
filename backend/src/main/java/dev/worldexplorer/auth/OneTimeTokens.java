package dev.worldexplorer.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Single-use tokens for links in e-mails (verify address, reset password).
 *
 * <p>Same idea as the refresh tokens: the link contains a random token, Redis only stores its hash
 * ({@code ott:<purpose>:<sha256> → userId}) with a TTL, and {@code GETDEL} makes it usable exactly once.
 */
@Component
public class OneTimeTokens {

    public enum Purpose { VERIFY_EMAIL, RESET_PASSWORD }

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StringRedisTemplate redis;

    public OneTimeTokens(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public String create(Purpose purpose, UUID userId, Duration ttl) {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redis.opsForValue().set(key(purpose, token), userId.toString(), ttl);
        return token;
    }

    public Optional<UUID> consume(Purpose purpose, String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return Optional.ofNullable(redis.opsForValue().getAndDelete(key(purpose, token))).map(UUID::fromString);
    }

    private static String key(Purpose purpose, String token) {
        return "ott:" + purpose.name().toLowerCase() + ":" + TokenService.sha256(token);
    }
}
