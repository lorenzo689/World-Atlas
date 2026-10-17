package dev.worldexplorer.auth;

import dev.worldexplorer.auth.AuthDtos.AdminUserDto;
import dev.worldexplorer.auth.AuthDtos.RegisterRequest;
import dev.worldexplorer.auth.AuthDtos.UserDto;
import dev.worldexplorer.auth.OneTimeTokens.Purpose;
import dev.worldexplorer.auth.mail.Mailer;
import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.UserRegistered;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Accounts and sessions. The controller turns the returned {@link Session} into a JSON body (access
 * token) plus an HttpOnly cookie (refresh token).
 */
@Service
public class AuthService {

    public record Session(TokenService.Tokens tokens, UserDto user) {}

    private static final Duration VERIFY_TTL = Duration.ofDays(3);
    private static final Duration RESET_TTL = Duration.ofMinutes(30);

    /** Compared against when the e-mail is unknown, so "unknown user" and "wrong password" take equally long. */
    private final String dummyHash;

    private final AppUserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final OneTimeTokens oneTime;
    private final Mailer mailer;
    private final EventPublisher events;
    private final List<String> adminEmails;
    private final String publicUrl;

    public AuthService(AppUserRepository users, PasswordEncoder passwords, TokenService tokens, OneTimeTokens oneTime,
            Mailer mailer, EventPublisher events, AppProperties props) {
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        this.oneTime = oneTime;
        this.mailer = mailer;
        this.events = events;
        this.adminEmails = props.adminEmails().stream().map(String::toLowerCase).toList();
        this.publicUrl = props.auth().publicUrl();
        this.dummyHash = passwords.encode("not-a-real-password");
    }

    // ---- sign up / in ----------------------------------------------------------------------------

    @Transactional
    public Session register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "An account with this e-mail already exists.");
        }
        List<String> roles = new ArrayList<>(List.of("USER"));
        // bootstrap: the addresses in app.admin-emails become admins; afterwards admins manage roles
        if (adminEmails.contains(email)) roles.add("ADMIN");
        AppUser user = users.save(AppUser.account(email, req.displayName().trim(), passwords.encode(req.password()), roles));
        user.touchLogin();
        sendVerification(user);
        events.publish(UserRegistered.of(user.getId(), user.getDisplayName(), false));
        return session(user);
    }

    @Transactional
    public Session login(String email, String password) {
        AppUser user = users.findByEmail(email.trim()).orElse(null);
        String hash = user == null || user.getPasswordHash() == null ? dummyHash : user.getPasswordHash();
        boolean ok = passwords.matches(password, hash);
        if (user == null || !ok) throw ApiException.unauthorized("E-mail or password is wrong.");
        user.touchLogin();
        return session(user);
    }

    /** A guest gets a real user row (so scores and multiplayer seats have an id) but no credentials. */
    @Transactional
    public Session guest(String displayName) {
        AppUser user = users.save(AppUser.guest(displayName.trim()));
        events.publish(UserRegistered.of(user.getId(), user.getDisplayName(), true));
        return session(user);
    }

    @Transactional(readOnly = true)
    public Session refresh(String refreshToken) {
        UUID userId = tokens.consumeRefreshToken(refreshToken)
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        AppUser user = users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        return session(user);
    }

    public void logout(String refreshToken) {
        if (refreshToken != null) tokens.revoke(refreshToken);
    }

    @Transactional(readOnly = true)
    public UserDto me(UUID userId) {
        return users.findById(userId).map(UserDto::of).orElseThrow(() -> ApiException.notFound("User", userId));
    }

    // ---- e-mail verification -----------------------------------------------------------------------

    @Transactional(readOnly = true)
    public void resendVerification(UUID userId) {
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User", userId));
        if (user.isGuest() || user.isEmailVerified()) return;
        sendVerification(user);
    }

    /** Returns a fresh session so the new {@code email_verified} claim is in the access token right away. */
    @Transactional
    public Session verifyEmail(String token) {
        UUID userId = oneTime.consume(Purpose.VERIFY_EMAIL, token)
                .orElseThrow(() -> ApiException.badRequest("invalid_token", "This link is invalid or has expired."));
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User", userId));
        user.verifyEmail();
        return session(user);
    }

    private void sendVerification(AppUser user) {
        String token = oneTime.create(Purpose.VERIFY_EMAIL, user.getId(), VERIFY_TTL);
        mailer.send(user.getEmail(), "Confirm your World Explorer account", """
                Hi %s,

                please confirm your e-mail address:
                %s/verify?token=%s

                The link is valid for 3 days.
                """.formatted(user.getDisplayName(), publicUrl, token));
    }

    // ---- password reset ----------------------------------------------------------------------------

    /**
     * Always succeeds from the caller's point of view, so the endpoint does not reveal which e-mail
     * addresses have an account.
     */
    @Transactional(readOnly = true)
    public void forgotPassword(String email) {
        users.findByEmail(email.trim()).filter(u -> !u.isGuest()).ifPresent(user -> {
            String token = oneTime.create(Purpose.RESET_PASSWORD, user.getId(), RESET_TTL);
            mailer.send(user.getEmail(), "Reset your World Explorer password", """
                    Hi %s,

                    somebody (hopefully you) asked to reset your password:
                    %s/reset-password?token=%s

                    The link is valid for 30 minutes. If it wasn't you, just ignore this e-mail.
                    """.formatted(user.getDisplayName(), publicUrl, token));
        });
    }

    /** Sets the new password, ends all existing sessions and signs the user in. */
    @Transactional
    public Session resetPassword(String token, String newPassword) {
        UUID userId = oneTime.consume(Purpose.RESET_PASSWORD, token)
                .orElseThrow(() -> ApiException.badRequest("invalid_token", "This link is invalid or has expired."));
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User", userId));
        user.changePassword(passwords.encode(newPassword));
        user.verifyEmail(); // the link proves access to the mailbox
        tokens.revokeAll(userId);
        return session(user);
    }

    // ---- administration ----------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<AdminUserDto> listUsers(int page, int size) {
        return users.findAll(PageRequest.of(page, Math.min(size, 200), Sort.by(Sort.Direction.DESC, "createdAt")))
                .map(AdminUserDto::of).toList();
    }

    @Transactional
    public AdminUserDto setRoles(UUID adminId, UUID userId, List<String> roles) {
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User", userId));
        if (adminId.equals(userId) && !roles.contains("ADMIN")) {
            throw ApiException.badRequest("self_demotion", "You cannot remove your own admin role.");
        }
        user.setRoles(new ArrayList<>(new LinkedHashSet<>(roles)));
        tokens.revokeAll(userId); // new roles take effect with the next sign-in
        return AdminUserDto.of(user);
    }

    private Session session(AppUser user) {
        return new Session(tokens.issue(user), UserDto.of(user));
    }
}
