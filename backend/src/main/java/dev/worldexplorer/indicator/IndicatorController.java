package dev.worldexplorer.indicator;

import dev.worldexplorer.indicator.IndicatorDtos.CorrelationResponse;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorInfo;
import dev.worldexplorer.indicator.IndicatorDtos.IndicatorStats;
import dev.worldexplorer.indicator.IndicatorDtos.LatestValues;
import dev.worldexplorer.indicator.IndicatorDtos.ProfileValue;
import dev.worldexplorer.indicator.IndicatorDtos.RankingEntry;
import dev.worldexplorer.indicator.IndicatorDtos.SeriesResponse;
import dev.worldexplorer.indicator.IndicatorDtos.TrendPoint;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Data platform", description = "World Bank indicators ingested into PostgreSQL")
@RestController
@RequestMapping("/api/indicators")
public class IndicatorController {

    private static final CacheControl TEN_MINUTES = CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic();

    private final IndicatorQueryService query;

    public IndicatorController(IndicatorQueryService query) {
        this.query = query;
    }

    @Operation(summary = "All indicators with their coverage (countries, years, last update)")
    @GetMapping
    List<IndicatorInfo> catalog() {
        return query.catalog().items();
    }

    @Operation(summary = "Most recent value per country (for the choropleth)")
    @GetMapping("/{key}/latest")
    ResponseEntity<LatestValues> latest(@PathVariable String key) {
        return ResponseEntity.ok().cacheControl(TEN_MINUTES).body(query.latest(key));
    }

    @Operation(summary = "Time series for up to 12 countries")
    @GetMapping("/{key}/series")
    SeriesResponse series(@PathVariable String key, @RequestParam List<String> countries,
            @RequestParam(required = false) Integer from, @RequestParam(required = false) Integer to) {
        return query.series(key, countries, from, to);
    }

    @Operation(summary = "Countries ranked by their latest value")
    @GetMapping("/{key}/ranking")
    List<RankingEntry> ranking(@PathVariable String key, @RequestParam(defaultValue = "desc") String order,
            @RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) Integer year) {
        return query.ranking(key, "asc".equalsIgnoreCase(order), limit, year);
    }

    @Operation(summary = "Distribution of the latest values (quartiles, mean)")
    @GetMapping("/{key}/stats")
    IndicatorStats stats(@PathVariable String key) {
        return query.stats(key);
    }

    @Operation(summary = "Median / mean / min / max across countries per year")
    @GetMapping("/{key}/trend")
    List<TrendPoint> trend(@PathVariable String key) {
        return query.trend(key);
    }

    @Operation(summary = "Scatter plot of two indicators and Pearson's correlation coefficient")
    @GetMapping("/correlation")
    CorrelationResponse correlation(@RequestParam String x, @RequestParam String y) {
        return query.correlation(x, y);
    }

    @Operation(summary = "All indicators of one country with its world rank")
    @GetMapping("/countries/{code}")
    List<ProfileValue> profile(@PathVariable String code) {
        return query.profile(code);
    }
}
