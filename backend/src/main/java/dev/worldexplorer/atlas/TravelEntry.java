package dev.worldexplorer.atlas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** "I have been here / lived here / want to go here", optionally with date and rating. */
@Entity
@Table(name = "travel_entry")
@IdClass(UserCountryId.class)
public class TravelEntry {

    public enum Status { VISITED, LIVED, WISHLIST }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "country_code")
    private String countryCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "visited_on")
    private LocalDate visitedOn;

    private Short rating;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TravelEntry() {}

    public TravelEntry(UUID userId, String countryCode) {
        this.userId = userId;
        this.countryCode = countryCode;
    }

    public void update(Status status, LocalDate visitedOn, Integer rating) {
        this.status = status;
        this.visitedOn = visitedOn;
        this.rating = rating == null ? null : rating.shortValue();
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() { return userId; }
    public String getCountryCode() { return countryCode; }
    public Status getStatus() { return status; }
    public LocalDate getVisitedOn() { return visitedOn; }
    public Integer getRating() { return rating == null ? null : rating.intValue(); }
    public Instant getUpdatedAt() { return updatedAt; }
}
