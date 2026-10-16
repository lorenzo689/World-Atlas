package dev.worldexplorer.atlas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A saved globe camera + mode, shareable through a short slug (/views/{slug}) when public. */
@Entity
@Table(name = "saved_view")
public class SavedView {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String mode;

    private String metric;
    private double lat;
    private double lng;
    private double altitude;

    @Column(name = "selected_country")
    private String selectedCountry;

    @Column(name = "public")
    private boolean isPublic;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SavedView() {}

    public SavedView(UUID userId, String slug, String name, String mode, String metric, double lat, double lng,
            double altitude, String selectedCountry, boolean isPublic) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.slug = slug;
        this.name = name;
        this.mode = mode;
        this.metric = metric;
        this.lat = lat;
        this.lng = lng;
        this.altitude = altitude;
        this.selectedCountry = selectedCountry;
        this.isPublic = isPublic;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getSlug() { return slug; }
    public String getName() { return name; }
    public String getMode() { return mode; }
    public String getMetric() { return metric; }
    public double getLat() { return lat; }
    public double getLng() { return lng; }
    public double getAltitude() { return altitude; }
    public String getSelectedCountry() { return selectedCountry; }
    public boolean isPublic() { return isPublic; }
    public Instant getCreatedAt() { return createdAt; }
}
