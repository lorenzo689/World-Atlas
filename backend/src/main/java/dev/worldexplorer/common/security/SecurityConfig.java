package dev.worldexplorer.common.security;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.auth.AppUserRepository;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.json.JsonMapper;

/**
 * HTTP security.
 *
 * <ul>
 *   <li>Stateless: no HTTP session, every request carries {@code Authorization: Bearer <jwt>}.
 *   <li>Bearer authentication is not sent automatically by browsers. Cookie-backed refresh and logout
 *       separately enforce an exact allowed Origin.
 *   <li>Roles: GUEST (quick nickname login for games), USER (account), ADMIN.
 * </ul>
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, JwtAuthenticationConverter jwtConverter, JsonMapper json,
            AppProperties props, AppUserRepository users) throws Exception {
        boolean requireVerified = props.auth().requireVerifiedEmail();
        http.csrf(c -> c.disable())
                .cors(c -> {})
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        // infrastructure
                        .requestMatchers("/actuator/health/**", "/actuator/info", "/actuator/prometheus").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/ws", "/ws/**").permitAll() // authenticated on STOMP CONNECT instead
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        .requestMatchers("/api/health").permitAll()
                        // auth
                        .requestMatchers("/api/auth/me", "/api/auth/verify/resend").authenticated()
                        .requestMatchers("/api/dev/**").permitAll() // the controller refuses unless app.auth.dev-mailbox
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/rooms", "/api/rooms/").permitAll()
                        // public read-only data
                        .requestMatchers(HttpMethod.GET,
                                "/api/countries/**", "/api/search/**", "/api/indicators/**",
                                "/api/leaderboard/**", "/api/activity/**", "/api/views/**",
                                "/api/conflicts", "/api/conflicts/**",
                                "/api/challenges/**")
                        .permitAll()
                        // protected areas
                        .requestMatchers("/api/admin/**", "/api/analytics/**").access((auth, ctx) ->
                                new AuthorizationDecision(adminAllowed(auth.get(), users)))
                        .requestMatchers("/api/atlas/**").access((auth, ctx) -> new AuthorizationDecision(
                                atlasAllowed(auth.get(), requireVerified)))
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtConverter)))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                writeProblem(res, json, HttpStatus.UNAUTHORIZED, "unauthorized", "Please sign in."))
                        .accessDeniedHandler((req, res, ex) ->
                                writeProblem(res, json, HttpStatus.FORBIDDEN, "forbidden", "You are not allowed to do that.")));
        return http.build();
    }

    /** Accounts only (no guests); with app.auth.require-verified-email also a confirmed e-mail address. */
    private static boolean atlasAllowed(Authentication auth, boolean requireVerified) {
        if (auth == null || auth.getAuthorities().stream().noneMatch(a -> "ROLE_USER".equals(a.getAuthority()))) {
            return false;
        }
        if (!requireVerified) return true;
        return auth instanceof JwtAuthenticationToken jwt && Boolean.TRUE.equals(jwt.getToken().getClaim("email_verified"));
    }

    /** Resolve privileged access against current database state: stale JWT roles cannot retain ADMIN. */
    private static boolean adminAllowed(Authentication auth, AppUserRepository users) {
        if (!(auth instanceof JwtAuthenticationToken jwt)) return false;
        try {
            return users.findById(java.util.UUID.fromString(jwt.getToken().getSubject()))
                    .filter(user -> user.isEmailVerified() && user.getRoles().contains("ADMIN"))
                    .isPresent();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(props.cors().allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-Id", "If-Match"));
        cors.setExposedHeaders(List.of("X-Request-Id", "X-RateLimit-Remaining", "Retry-After", "ETag"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    private static void writeProblem(HttpServletResponse res, JsonMapper json, HttpStatus status, String code, String detail)
            throws java.io.IOException {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setType(URI.create("https://world-explorer.dev/problems/" + code));
        pd.setProperty("code", code);
        res.setStatus(status.value());
        res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        json.writeValue(res.getOutputStream(), pd);
    }
}
