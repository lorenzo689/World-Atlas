package dev.worldexplorer.atlas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * A free-text note about a country. {@code @Version} enables optimistic locking: an update carries
 * the version the client last saw; if someone saved in between, Hibernate's
 * {@code UPDATE ... WHERE id = ? AND version = ?} hits no row and the request fails with 409
 * instead of silently overwriting the other change.
 */
@Entity
@Table(name = "note")
public class Note {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "country_code", nullable = false)
    private String countryCode;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String body;

    @Version
    private long version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Note() {}

    public Note(UUID userId, String countryCode, String title, String body) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.countryCode = countryCode;
        this.title = title;
        this.body = body;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void edit(String title, String body) {
        this.title = title;
        this.body = body;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getCountryCode() { return countryCode; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
