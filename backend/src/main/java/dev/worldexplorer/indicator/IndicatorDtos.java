package dev.worldexplorer.indicator;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class IndicatorDtos {

    public record Point(int year, double value) {}

    public record IndicatorInfo(
            String key, String worldBankId, String label, String unit, Coverage coverage) {}

    /** Wrapper so the catalog can be cached as one typed Redis value. */
    public record Catalog(List<IndicatorInfo> items) {}

    /** What the platform holds for one indicator. */
    public record Coverage(int countries, long observations, Integer fromYear, Integer toYear, Instant lastUpdated) {}

    /** Most recent value per country (for the choropleth). */
    public record LatestValues(String indicatorKey, Map<String, Point> values) {}

    public record CountrySeries(String code, String name, List<Point> points) {}

    public record SeriesResponse(String indicatorKey, List<CountrySeries> series) {}

    public record RankingEntry(int rank, String code, String name, String region, int year, double value) {}

    public record IndicatorStats(
            String indicatorKey, int countries, Integer latestYear, Double min, Double p25, Double median,
            Double p75, Double max, Double mean) {}

    public record TrendPoint(int year, int countries, double median, double mean, double min, double max) {}

    public record ScatterPoint(String code, String name, String region, double x, double y) {}

    public record CorrelationResponse(String x, String y, Double pearsonR, int n, List<ScatterPoint> points) {}

    public record ProfileValue(String key, String label, String unit, int year, double value, Integer rank, int of) {}

    public record IngestionRunDto(
            UUID id, String indicatorKey, String trigger, String status, int fetched, int stored, String error,
            Instant startedAt, Instant finishedAt) {

        static IngestionRunDto of(IngestionRun r) {
            return new IngestionRunDto(r.getId(), r.getIndicatorKey(), r.getTrigger().name(), r.getStatus().name(),
                    r.getFetched(), r.getStored(), r.getError(), r.getStartedAt(), r.getFinishedAt());
        }
    }

    private IndicatorDtos() {}
}
