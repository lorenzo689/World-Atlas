package dev.worldexplorer.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Typed application settings (everything under {@code app.*} in application.yml).
 * Records + constructor binding make the configuration immutable and self-documenting.
 */
@ConfigurationProperties("app")
public record AppProperties(
        Jwt jwt,
        Cors cors,
        Ingestion ingestion,
        Quiz quiz,
        Multiplayer multiplayer,
        RateLimit rateLimit,
        Auth auth,
        @DefaultValue List<String> adminEmails) {

    /**
     * @param publicUrl          where the frontend runs; used for links in e-mails
     * @param cookieSecure       send the refresh-token cookie only over HTTPS (true in production)
     * @param requireVerifiedEmail personal atlas only after the e-mail address was confirmed
     * @param devMailbox         expose sent e-mails at /api/dev/mails (local development only!)
     */
    public record Auth(
            @DefaultValue("http://localhost:5173") String publicUrl,
            @DefaultValue("false") boolean cookieSecure,
            @DefaultValue("false") boolean requireVerifiedEmail,
            @DefaultValue("false") boolean devMailbox,
            @DefaultValue("World Explorer <no-reply@worldexplorer.dev>") String mailFrom) {}

    public record Jwt(
            String secret,
            @DefaultValue("world-explorer") String issuer,
            @DefaultValue("15m") Duration accessTokenTtl,
            @DefaultValue("14d") Duration refreshTokenTtl) {}

    public record Cors(@DefaultValue({"http://localhost:5173", "http://localhost:4173"}) List<String> allowedOrigins) {}

    public record Ingestion(
            @DefaultValue("https://api.worldbank.org/v2") String worldBankBaseUrl,
            @DefaultValue("1990") int fromYear,
            /* Run the full ingestion once on startup when the database has no indicator values yet. */
            @DefaultValue("true") boolean bootstrapOnStartup,
            @DefaultValue("true") boolean scheduleEnabled,
            @DefaultValue("10m") Duration runTimeout) {}

    public record Quiz(
            @DefaultValue("10") int defaultRounds,
            @DefaultValue("1h") Duration sessionTtl) {}

    public record Multiplayer(
            @DefaultValue("15s") Duration roundDuration,
            @DefaultValue("4s") Duration resultPause,
            @DefaultValue("3s") Duration countdown,
            @DefaultValue("8") int maxPlayers,
            @DefaultValue("2h") Duration roomTtl) {}

    public record RateLimit(
            @DefaultValue("20") int authPerMinute,
            @DefaultValue("240") int apiPerMinute) {}
}
