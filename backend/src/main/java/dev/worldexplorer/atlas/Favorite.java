package dev.worldexplorer.atlas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "favorite")
@IdClass(UserCountryId.class)
public class Favorite {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "country_code")
    private String countryCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Favorite() {}

    public Favorite(UUID userId, String countryCode) {
        this.userId = userId;
        this.countryCode = countryCode;
        this.createdAt = Instant.now();
    }

    public UUID getUserId() { return userId; }
    public String getCountryCode() { return countryCode; }
    public Instant getCreatedAt() { return createdAt; }
}
