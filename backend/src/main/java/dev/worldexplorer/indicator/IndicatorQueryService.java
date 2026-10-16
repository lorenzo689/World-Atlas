package dev.worldexplorer.indicator;

import dev.worldexplorer.common.config.CacheNames;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.indicator.IndicatorDtos.CorrelationResponse;
import dev.worldexplorer.indicator.IndicatorDtos.CountrySeries;
import dev.worldexplorer.indicator.IndicatorDtos.Coverage;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorInfo;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorStats;
import dev.worldexplorer.indicator.IndicatorDtos.LatestValues;
import dev.worldexplorer.indicator.IndicatorDtos.Point;
import dev.worldexplorer.indicator.IndicatorDtos.ProfileValue;
import dev.worldexplorer.indicator.IndicatorDtos.RankingEntry;
import dev.worldexplorer.indicator.IndicatorDtos.ScatterPoint;
import dev.worldexplorer.indicator.IndicatorDtos.SeriesResponse;
import dev.worldexplorer.indicator.IndicatorDtos.TrendPoint;
import java.time.Year;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/** Read side of the data platform. Only real countries are returned (no World Bank aggregates). */
@Service
public class IndicatorQueryService {

    private final IndicatorValueRepository values;
    private final CountryCatalog countries;

    public IndicatorQueryService(IndicatorValueRepository values, CountryCatalog countries) {
        this.values = values;
        this.countries = countries;
    }

    /** Coverage is an aggregate over the whole table – cached, evicted after every ingestion. */
    @Cacheable(cacheNames = CacheNames.INDICATOR_CATALOG, key = "'all'")
    public IndicatorDtos.Catalog catalog() {
        Map<String, Coverage> coverage = values.coverage();
        return new IndicatorDtos.Catalog(Arrays.stream(IndicatorDefinition.values())
                .map(d -> new IndicatorInfo(d.key(), d.worldBankId(), d.label(), d.unit(),
                        coverage.getOrDefault(d.key(), new Coverage(0, 0, null, null, null))))
                .toList());
    }

    @Cacheable(cacheNames = CacheNames.INDICATOR_LATEST, key = "#key")
    public LatestValues latest(String key) {
        IndicatorDefinition def = IndicatorDefinition.of(key);
        Map<String, Point> all = values.latest(def.key(), null);
        all.keySet().retainAll(knownCodes());
        return new LatestValues(def.key(), all);
    }

    public SeriesResponse series(String key, List<String> codes, Integer from, Integer to) {
        IndicatorDefinition def = IndicatorDefinition.of(key);
        if (codes.isEmpty() || codes.size() > 12) throw ApiException.badRequest("invalid_countries", "Give 1–12 country codes.");
        List<String> upper = codes.stream().map(String::toUpperCase).distinct().toList();
        Map<String, List<Point>> data = values.series(def.key(), upper,
                from == null ? 1960 : from, to == null ? Year.now().getValue() : to);
        List<CountrySeries> series = upper.stream()
                .map(c -> new CountrySeries(c, countries.find(c).map(Country::getName).orElse(c),
                        data.getOrDefault(c, List.of())))
                .toList();
        return new SeriesResponse(def.key(), series);
    }

    public List<RankingEntry> ranking(String key, boolean ascending, int limit, Integer year) {
        IndicatorDefinition def = IndicatorDefinition.of(key);
        int safeLimit = Math.max(1, Math.min(limit, 250));
        // over-fetch: aggregates are filtered out after the query
        List<IndicatorValueRepository.RankedRow> rows = values.ranking(def.key(), ascending, 400, year);
        List<RankingEntry> out = new ArrayList<>();
        int rank = 0;
        for (var r : rows) {
            Country c = countries.find(r.code()).orElse(null);
            if (c == null) continue;
            out.add(new RankingEntry(++rank, c.getCode(), c.getName(), c.getRegion(), r.year(), r.value()));
            if (out.size() == safeLimit) break;
        }
        return out;
    }

    @Cacheable(cacheNames = CacheNames.INDICATOR_STATS, key = "#key")
    public IndicatorStats stats(String key) {
        IndicatorDefinition def = IndicatorDefinition.of(key);
        var s = values.stats(def.key());
        return new IndicatorStats(def.key(), s.countries(), s.latestYear(), s.min(), s.p25(), s.median(), s.p75(),
                s.max(), s.mean());
    }

    public List<TrendPoint> trend(String key) {
        return values.trend(IndicatorDefinition.of(key).key());
    }

    public CorrelationResponse correlation(String xKey, String yKey) {
        IndicatorDefinition x = IndicatorDefinition.of(xKey);
        IndicatorDefinition y = IndicatorDefinition.of(yKey);
        var result = values.correlation(x.key(), y.key());
        List<ScatterPoint> points = result.pairs().stream()
                .flatMap(p -> countries.find(p.code()).stream()
                        .map(c -> new ScatterPoint(c.getCode(), c.getName(), c.getRegion(), p.x(), p.y())))
                .toList();
        return new CorrelationResponse(x.key(), y.key(), result.r(), points.size(), points);
    }

    /** Every indicator's latest value for one country, with its rank among all countries. */
    public List<ProfileValue> profile(String countryCode) {
        String code = countryCode.toUpperCase();
        if (!countries.exists(code)) throw ApiException.notFound("Country", countryCode);
        Map<String, IndicatorValueRepository.ProfileRow> rows = values.profile(code).stream()
                .collect(Collectors.toMap(IndicatorValueRepository.ProfileRow::key, r -> r));
        List<ProfileValue> out = new ArrayList<>();
        for (IndicatorDefinition def : IndicatorDefinition.values()) {
            var row = rows.get(def.key());
            if (row != null) {
                out.add(new ProfileValue(def.key(), def.label(), def.unit(), row.year(), row.value(), row.rank(), row.of()));
            }
        }
        return out;
    }

    /** Population per country – used by the quiz for "which is bigger?" questions. */
    public Map<String, Double> latestNumbers(String key) {
        return latest(key).values().entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().value()));
    }

    private Set<String> knownCodes() {
        return countries.all().stream().map(Country::getCode).collect(Collectors.toSet());
    }
}
