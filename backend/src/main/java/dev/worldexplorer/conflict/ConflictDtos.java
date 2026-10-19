package dev.worldexplorer.conflict;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ConflictDtos {
    public record Localized(String de, String en) {}
    public record Point(double lat, double lng) {}
    public record Brief(String id, List<String> countryCodes, Localized title, Localized region,
            String status, Point location, String locationPrecision, String sourceDate, String sourceName,
            String sourceUrl, String reviewedAt, int revision, Localized summary, Localized context,
            Localized question, Localized answer) {}
    public record Dataset(int schemaVersion, String updatedAt, List<Brief> briefs) {}
    public record Revision(UUID id, String briefId, int version, Brief brief, Instant createdAt,
            Instant publishedAt, Instant sourceCheckedAt, String sourceCheckStatus) {}

    private ConflictDtos() {}
}
