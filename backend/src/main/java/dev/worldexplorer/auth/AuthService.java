package dev.worldexplorer.auth;

import dev.worldexplorer.auth.AuthDtos.AuthResponse;
import dev.worldexplorer.auth.AuthDtos.RegisterRequest;
import dev.worldexplorer.auth.AuthDtos.UserDto;
import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.UserRegistered;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** Compared against when the e-mail is unknown, so "unknown user" and "wrong password" take equally long. */
    private final String dummyHash;

    private final AppUserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final EventPublisher events;
    private final List<String> adminEmails;

    public AuthService(AppUserRepository users, PasswordEncoder passwords, TokenService tokens, EventPublisher events,
            AppProperties props) {
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        this.events = events;
        this.adminEmails = props.adminEmails().stream().map(String::toLowerCase).toList();
        this.dummyHash = passwords.encode("not-a-real-password");
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "An account with this e-mail already exists.");
        }
        List<String> roles = new ArrayList<>(List.of("USER"));
        if (adminEmails.contains(email)) roles.add("ADMIN");
        AppUser user = users.save(AppUser.account(email, req.displayName().trim(), passwords.encode(req.password()), roles));
        user.touchLogin();
        events.publish(UserRegistered.of(user.getId(), user.getDisplayName(), false));
        return respond(user);
    }

    @Transactional
    public AuthResponse login(String email, String password) {
        AppUser user = users.findByEmail(email.trim()).orElse(null);
        String hash = user == null || user.getPasswordHash() == null ? dummyHash : user.getPasswordHash();
        boolean ok = passwords.matches(password, hash);
        if (user == null || !ok) throw ApiException.unauthorized("E-mail or password is wrong.");
        user.touchLogin();
        return respond(user);
    }

    /** A guest gets a real user row (so scores and multiplayer seats have an id) but no credentials. */
    @Transactional
    public AuthResponse guest(String displayName) {
        AppUser user = users.save(AppUser.guest(displayName.trim()));
        events.publish(UserRegistered.of(user.getId(), user.getDisplayName(), true));
        return respond(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse refresh(String refreshToken) {
        UUID userId = tokens.consumeRefreshToken(refreshToken)
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        AppUser user = users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        return respond(user);
    }

    public void logout(String refreshToken) {
        tokens.revoke(refreshToken);
    }

    @Transactional(readOnly = true)
    public UserDto me(UUID userId) {
        return users.findById(userId).map(UserDto::of).orElseThrow(() -> ApiException.notFound("User", userId));
    }

    private AuthResponse respond(AppUser user) {
        TokenService.Tokens t = tokens.issue(user);
        return new AuthResponse(t.accessToken(), t.expiresIn(), t.refreshToken(), UserDto.of(user));
    }
}
