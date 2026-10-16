package dev.worldexplorer.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** An account (e-mail + password) or a guest (nickname only, used for quick games). */
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    private UUID id;

    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "password_hash")
    private String passwordHash;

    /** PostgreSQL text[] mapped to a Java array. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] roles;

    private boolean guest;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AppUser() {}

    private AppUser(UUID id, String email, String displayName, String passwordHash, List<String> roles, boolean guest) {
        this.id = id;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.roles = roles.toArray(String[]::new);
        this.guest = guest;
        this.createdAt = Instant.now();
    }

    public static AppUser account(String email, String displayName, String passwordHash, List<String> roles) {
        return new AppUser(UUID.randomUUID(), email, displayName, passwordHash, roles, false);
    }

    public static AppUser guest(String displayName) {
        return new AppUser(UUID.randomUUID(), null, displayName, null, List.of("GUEST"), true);
    }

    public void touchLogin() {
        this.lastLoginAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public List<String> getRoles() {
        return Arrays.asList(roles);
    }

    public boolean isGuest() {
        return guest;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
