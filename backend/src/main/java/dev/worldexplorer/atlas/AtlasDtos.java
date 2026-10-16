package dev.worldexplorer.atlas;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AtlasDtos {

    public record FavoriteDto(String code, String name, String region, String flagEmoji, Instant createdAt) {}

    public record TravelRequest(
            @NotNull TravelEntry.Status status,
            @PastOrPresent LocalDate visitedOn,
            @Min(1) @Max(5) Integer rating) {}

    public record TravelDto(String code, String name, String region, String flagEmoji, TravelEntry.Status status,
            LocalDate visitedOn, Integer rating, Instant updatedAt) {}

    public record NoteRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z]{3}$") String countryCode,
            @NotBlank @Size(max = 140) String title,
            @Size(max = 20_000) String body) {}

    public record NoteUpdate(@NotBlank @Size(max = 140) String title, @Size(max = 20_000) String body,
            @NotNull Long version) {}

    public record NoteDto(UUID id, String countryCode, String countryName, String title, String body, long version,
            Instant createdAt, Instant updatedAt) {}

    public record ViewRequest(
            @NotBlank @Size(max = 80) String name,
            @NotBlank @Pattern(regexp = "satellite|political|data") String mode,
            @Size(max = 40) String metric,
            @DecimalMin("-90") @DecimalMax("90") double lat,
            @DecimalMin("-180") @DecimalMax("180") double lng,
            @DecimalMin("0.05") @DecimalMax("10") double altitude,
            @Pattern(regexp = "^[A-Za-z]{3}$") String selectedCountry,
            boolean isPublic) {}

    public record ViewDto(UUID id, String slug, String name, String mode, String metric, double lat, double lng,
            double altitude, String selectedCountry, boolean isPublic, Instant createdAt, String owner) {}

    public record RegionProgress(int visited, int total) {}

    public record AtlasStats(int visited, int lived, int wishlist, int favorites, long notes, int totalCountries,
            double percentOfWorld, Map<String, RegionProgress> byRegion, List<String> visitedCodes) {}

    /** Everything the globe's info panel needs to render the "my atlas" buttons for one country. */
    public record CountryState(String code, boolean favorite, TravelEntry.Status travel, int notes) {}

    private AtlasDtos() {}
}
