package dev.worldexplorer.common.security;

import java.util.UUID;

/**
 * Answers "is this user an admin right now?" for {@link SecurityConfig}.
 *
 * <p>This is dependency inversion: the security configuration lives in {@code common}, but users are
 * stored by the {@code auth} module. Instead of {@code common} importing {@code auth}'s repository,
 * {@code common} declares the question it needs answered and {@code auth} implements it
 * ({@code AppUserAdminDirectory}). {@code ArchitectureTest} keeps {@code common} free of module imports.
 */
public interface AdminDirectory {

    /** True only if the user exists, has a verified e-mail address and currently holds the ADMIN role. */
    boolean isVerifiedAdmin(UUID userId);
}
