package dev.worldexplorer.search;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class SearchDtos {

    public record CountryHit(
            String code, String name, String capital, String region, String flagEmoji, double score,
            Map<String, List<String>> highlights) {}

    /** Hits plus a facet (count per region) computed by a terms aggregation in the same request. */
    public record CountrySearchResult(String query, long total, List<CountryHit> hits, Map<String, Long> regions) {}

    public record NearbyHit(String code, String name, String region, double distanceKm) {}

    public record NoteHit(String id, String countryCode, String countryName, String title, String snippet,
            Instant updatedAt, double score) {}

    private SearchDtos() {}
}
