package dev.worldexplorer.auth;

import dev.worldexplorer.common.security.AdminDirectory;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Admin check against the current database state. A JWT issued before a role was revoked still
 * carries ADMIN; reading the user here makes the revocation effective immediately.
 */
@Component
class AppUserAdminDirectory implements AdminDirectory {

    private final AppUserRepository users;

    AppUserAdminDirectory(AppUserRepository users) {
        this.users = users;
    }

    @Override
    public boolean isVerifiedAdmin(UUID userId) {
        return users.findById(userId)
                .filter(user -> user.isEmailVerified() && user.getRoles().contains("ADMIN"))
                .isPresent();
    }
}
