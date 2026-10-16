package dev.worldexplorer.auth;

import dev.worldexplorer.common.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Two kinds of tokens:
 *
 * <ul>
 *   <li><b>Access token</b> – a short-lived signed JWT (15 min). Verified on every request without any
 *       lookup, which is why it cannot be revoked and is kept short.
 *   <li><b>Refresh token</b> – a long random string (14 days). Only its SHA-256 hash is stored in Redis
 *       ({@code refresh:<hash> → userId}, with TTL). Each use <em>rotates</em> it: the old one is
 *       deleted and a new one issued, so a stolen refresh token works at most once. Logout deletes it.
 * </ul>
 */
@Service
public class TokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JwtEncoder encoder;
    private final StringRedisTemplate redis;
    private final AppProperties.Jwt config;

    public TokenService(JwtEncoder encoder, StringRedisTemplate redis, AppProperties props) {
        this.encoder = encoder;
        this.redis = redis;
        this.config = props.jwt();
    }

    public record Tokens(String accessToken, long expiresIn, String refreshToken) {}

    public Tokens issue(AppUser user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(config.issuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(config.accessTokenTtl()))
                .id(UUID.randomUUID().toString())
                .claim("name", user.getDisplayName())
                .claim("roles", user.getRoles())
                .claim("guest", user.isGuest())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String access = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        String refresh = randomToken();
        redis.opsForValue().set(key(refresh), user.getId().toString(), config.refreshTokenTtl());
        return new Tokens(access, config.accessTokenTtl().toSeconds(), refresh);
    }

    /** Consumes a refresh token (one-time use) and returns the user it belonged to. */
    public Optional<UUID> consumeRefreshToken(String refreshToken) {
        String userId = redis.opsForValue().getAndDelete(key(refreshToken));
        return Optional.ofNullable(userId).map(UUID::fromString);
    }

    public void revoke(String refreshToken) {
        redis.delete(key(refreshToken));
    }

    private static String key(String refreshToken) {
        return "refresh:" + sha256(refreshToken);
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
