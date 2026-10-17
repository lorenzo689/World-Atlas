package dev.worldexplorer.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Request and response bodies of the auth API (records = immutable DTOs, validated with Bean Validation). */
public final class AuthDtos {

    private static final String NAME_PATTERN = "^[\\p{L}\\p{N} _.-]+$";
    private static final String NAME_MESSAGE = "letters, digits, spaces, '.', '_' and '-' only";

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 100, message = "must be 8–100 characters") String password,
            @NotBlank @Size(min = 2, max = 24) @Pattern(regexp = NAME_PATTERN, message = NAME_MESSAGE) String displayName) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record GuestRequest(
            @NotBlank @Size(min = 2, max = 24) @Pattern(regexp = NAME_PATTERN, message = NAME_MESSAGE) String displayName) {}

    /** Only for non-browser clients; browsers send the refresh token as an HttpOnly cookie. */
    public record RefreshRequest(String refreshToken) {}

    public record ForgotPasswordRequest(@NotBlank @Email String email) {}

    public record ResetPasswordRequest(
            @NotBlank String token,
            @NotBlank @Size(min = 8, max = 100, message = "must be 8–100 characters") String password) {}

    public record TokenRequest(@NotBlank String token) {}

    public record RolesRequest(@NotEmpty List<@Pattern(regexp = "USER|ADMIN|GUEST") String> roles) {}

    public record UserDto(UUID id, String displayName, String email, List<String> roles, boolean guest,
            boolean emailVerified) {
        static UserDto of(AppUser u) {
            return new UserDto(u.getId(), u.getDisplayName(), u.getEmail(), u.getRoles(), u.isGuest(), u.isEmailVerified());
        }
    }

    public record AdminUserDto(UUID id, String displayName, String email, List<String> roles, boolean guest,
            boolean emailVerified, Instant createdAt, Instant lastLoginAt) {
        static AdminUserDto of(AppUser u) {
            return new AdminUserDto(u.getId(), u.getDisplayName(), u.getEmail(), u.getRoles(), u.isGuest(),
                    u.isEmailVerified(), u.getCreatedAt(), u.getLastLoginAt());
        }
    }

    /** The refresh token is not part of the body: it travels in the HttpOnly cookie. */
    public record AuthResponse(String accessToken, long expiresIn, UserDto user) {}

    private AuthDtos() {}
}
