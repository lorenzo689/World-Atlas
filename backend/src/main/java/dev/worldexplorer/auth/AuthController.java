package dev.worldexplorer.auth;

import dev.worldexplorer.auth.AuthDtos.AuthResponse;
import dev.worldexplorer.auth.AuthDtos.ForgotPasswordRequest;
import dev.worldexplorer.auth.AuthDtos.GuestRequest;
import dev.worldexplorer.auth.AuthDtos.LoginRequest;
import dev.worldexplorer.auth.AuthDtos.RefreshRequest;
import dev.worldexplorer.auth.AuthDtos.RegisterRequest;
import dev.worldexplorer.auth.AuthDtos.ResetPasswordRequest;
import dev.worldexplorer.auth.AuthDtos.TokenRequest;
import dev.worldexplorer.auth.AuthDtos.UserDto;
import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Auth endpoints. The refresh token is set as a cookie:
 * <ul>
 *   <li>{@code HttpOnly} – not readable by JavaScript, so an XSS bug cannot steal it
 *   <li>{@code SameSite=Strict} – not sent with requests from other sites (CSRF protection)
 *   <li>{@code Path=/api/auth} – only sent to the endpoints that need it
 *   <li>{@code Secure} – HTTPS only (switched on in production)
 * </ul>
 */
@Tag(name = "Auth", description = "Accounts, guest login, token refresh, e-mail verification, password reset")
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    static final String COOKIE = "we_refresh";

    private final AuthService auth;
    private final boolean secureCookie;
    private final Duration refreshTtl;
    private final List<String> allowedOrigins;

    public AuthController(AuthService auth, AppProperties props) {
        this.auth = auth;
        this.secureCookie = props.auth().cookieSecure();
        this.refreshTtl = props.jwt().refreshTokenTtl();
        this.allowedOrigins = props.cors().allowedOrigins();
    }

    @PostMapping("/register")
    ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest body) {
        return respond(HttpStatus.CREATED, auth.register(body));
    }

    @PostMapping("/login")
    ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest body) {
        return respond(HttpStatus.OK, auth.login(body.email(), body.password()));
    }

    @PostMapping("/guest")
    ResponseEntity<AuthResponse> guest(@Valid @RequestBody GuestRequest body) {
        return respond(HttpStatus.CREATED, auth.guest(body.displayName()));
    }

    @Operation(summary = "New access token; the refresh token comes from the cookie (or the body for API clients)")
    @PostMapping("/refresh")
    ResponseEntity<AuthResponse> refresh(@CookieValue(name = COOKIE, required = false) String cookie,
            @RequestHeader(name = HttpHeaders.ORIGIN, required = false) String origin,
            @Valid @RequestBody(required = false) RefreshRequest body) {
        checkCookieOrigin(cookie, origin);
        String token = cookie != null ? cookie : body == null ? null : body.refreshToken();
        return respond(HttpStatus.OK, auth.refresh(token));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(@CookieValue(name = COOKIE, required = false) String cookie,
            @RequestHeader(name = HttpHeaders.ORIGIN, required = false) String origin,
            @Valid @RequestBody(required = false) RefreshRequest body) {
        checkCookieOrigin(cookie, origin);
        auth.logout(cookie != null ? cookie : body == null ? null : body.refreshToken());
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString()).build();
    }

    @GetMapping("/me")
    UserDto me(AuthUser user) {
        return auth.me(user.id());
    }

    @PostMapping("/verify")
    ResponseEntity<AuthResponse> verify(@Valid @RequestBody TokenRequest body) {
        return respond(HttpStatus.OK, auth.verifyEmail(body.token()));
    }

    @PostMapping("/verify/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void resendVerification(AuthUser user) {
        auth.resendVerification(user.id());
    }

    @Operation(summary = "Send a password-reset link (always 202, so it does not reveal registered addresses)")
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void forgotPassword(@Valid @RequestBody ForgotPasswordRequest body) {
        auth.forgotPassword(body.email());
    }

    @PostMapping("/reset-password")
    ResponseEntity<AuthResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest body) {
        return respond(HttpStatus.OK, auth.resetPassword(body.token(), body.password()));
    }

    private ResponseEntity<AuthResponse> respond(HttpStatus status, AuthService.Session s) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie(s.tokens().refreshToken(), refreshTtl).toString())
                .body(new AuthResponse(s.tokens().accessToken(), s.tokens().expiresIn(), s.user()));
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(maxAge)
                .build();
    }

    private void checkCookieOrigin(String cookie, String origin) {
        if (cookie != null && (origin == null || !allowedOrigins.contains(origin))) {
            throw ApiException.forbidden("Cookie authentication requires an allowed Origin.");
        }
    }
}
