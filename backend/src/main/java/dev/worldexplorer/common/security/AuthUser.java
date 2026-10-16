package dev.worldexplorer.common.security;

import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * The caller of a request, read from the verified JWT. Controllers simply declare an {@code AuthUser}
 * parameter (see {@link AuthUserArgumentResolver}); it is {@code null} for anonymous requests.
 */
public record AuthUser(UUID id, String name, List<String> roles, boolean guest) {

    public boolean isAdmin() {
        return roles.contains("ADMIN");
    }

    public static AuthUser from(Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        Boolean guest = jwt.getClaim("guest");
        return new AuthUser(
                UUID.fromString(jwt.getSubject()),
                jwt.getClaimAsString("name"),
                roles == null ? List.of() : roles,
                Boolean.TRUE.equals(guest));
    }

    /** @return the user, or null when the authentication is not a JWT (anonymous) */
    public static AuthUser from(Authentication authentication) {
        if (authentication instanceof JwtAuthenticationToken token) return from(token.getToken());
        return null;
    }
}
