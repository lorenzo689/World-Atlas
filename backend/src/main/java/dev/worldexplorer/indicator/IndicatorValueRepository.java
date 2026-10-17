package dev.worldexplorer.indicator;

import dev.worldexplorer.indicator.IndicatorDtos.Coverage;
import dev.worldexplorer.indicator.IndicatorDtos.Point;
import dev.worldexplorer.indicator.IndicatorDtos.TrendPoint;
import java.sql.Timestamp;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * SQL access to {@code indicator_value}. Plain SQL instead of JPA because this is analytics:
 * upserts in large batches, {@code DISTINCT ON}, window functions, {@code percentile_cont}, {@code corr}.
 */
@Repository
public class IndicatorValueRepository {

    /** Latest observation per country – PostgreSQL's DISTINCT ON keeps the first row per country. */
    private static final String LATEST = """
            select distinct on (country_code) country_code, year, value
            from indicator_value
            where indicator_key = :key %s
            order by country_code, year desc
            """;

    private final JdbcClient jdbc;
    private final JdbcTemplate template;

    public IndicatorValueRepository(JdbcClient jdbc, JdbcTemplate template) {
        this.jdbc = jdbc;
        this.template = template;
    }

    /** Idempotent bulk write: re-ingesting the same data just overwrites it ("upsert"). */
    public void upsert(List<IndicatorObservation> batch) {
        template.batchUpdate("""
                        insert into indicator_value (country_code, indicator_key, year, value, updated_at)
                        values (?, ?, ?, ?, now())
                        on conflict (indicator_key, country_code, year)
                        do update set value = excluded.value, updated_at = now()
                        where indicator_value.value is distinct from excluded.value
                        """,
                batch, 500, (ps, o) -> {
                    ps.setString(1, o.countryCode());
                    ps.setString(2, o.indicatorKey());
                    ps.setInt(3, o.year());
                    ps.setDouble(4, o.value());
                });
    }

    public Map<String, Point> latest(String key, Integer year) {
        String sql = LATEST.formatted(year == null ? "" : "and year <= :year");
        var spec = jdbc.sql(sql).param("key", key);
        if (year != null) spec = spec.param("year", year);
        Map<String, Point> out = new LinkedHashMap<>();
        spec.query((rs, i) -> {
            out.put(rs.getString("country_code"), new Point(rs.getInt("year"), rs.getDouble("value")));
            return null;
        }).list();
        return out;
    }

    /**
     * The value of every country "as of" a year: the most recent observation in [year - window, year].
     * Reporting is patchy (a country may skip a year), the window keeps the map filled without showing
     * values that are too old.
     */
    public Map<String, Point> asOf(String key, int year, int window) {
        Map<String, Point> out = new LinkedHashMap<>();
        jdbc.sql("""
                        select distinct on (country_code) country_code, year, value
                        from indicator_value
                        where indicator_key = :key and year between :from and :to
                        order by country_code, year desc
                        """)
                .param("key", key).param("from", year - window).param("to", year)
                .query((rs, i) -> {
                    out.put(rs.getString("country_code"), new Point(rs.getInt("year"), rs.getDouble("value")));
                    return null;
                }).list();
        return out;
    }

    public Map<String, List<Point>> series(String key, Collection<String> codes, int from, int to) {
        Map<String, List<Point>> out = new LinkedHashMap<>();
        jdbc.sql("""
                        select country_code, year, value from indicator_value
                        where indicator_key = :key and country_code in (:codes) and year between :from and :to
                        order by country_code, year
                        """)
                .param("key", key).param("codes", codes).param("from", from).param("to", to)
                .query((rs, i) -> {
                    out.computeIfAbsent(rs.getString("country_code"), c -> new java.util.ArrayList<>())
                            .add(new Point(rs.getInt("year"), rs.getDouble("value")));
                    return null;
                }).list();
        return out;
    }

    public record RankedRow(int rank, String code, int year, double value) {}

    public List<RankedRow> ranking(String key, boolean ascending, int limit, Integer year) {
        String latest = LATEST.formatted(year == null ? "" : "and year <= :year");
        String dir = ascending ? "asc" : "desc";
        var spec = jdbc.sql("""
                        with latest as (%s)
                        select country_code, year, value, rank() over (order by value %s) as rnk
                        from latest order by value %s limit :limit
                        """.formatted(latest, dir, dir))
                .param("key", key).param("limit", limit);
        if (year != null) spec = spec.param("year", year);
        return spec.query((rs, i) -> new RankedRow(
                rs.getInt("rnk"), rs.getString("country_code"), rs.getInt("year"), rs.getDouble("value"))).list();
    }

    public record StatsRow(int countries, Integer latestYear, Double min, Double p25, Double median, Double p75,
            Double max, Double mean) {}

    public StatsRow stats(String key) {
        return jdbc.sql("""
                        with latest as (%s)
                        select count(*) as n, max(year) as latest_year, min(value) as min_v,
                               percentile_cont(0.25) within group (order by value) as p25,
                               percentile_cont(0.5)  within group (order by value) as p50,
                               percentile_cont(0.75) within group (order by value) as p75,
                               max(value) as max_v, avg(value) as mean_v
                        from latest
                        """.formatted(LATEST.formatted("")))
                .param("key", key)
                .query((rs, i) -> new StatsRow(rs.getInt("n"), (Integer) rs.getObject("latest_year", Integer.class),
                        (Double) rs.getObject("min_v", Double.class), (Double) rs.getObject("p25", Double.class),
                        (Double) rs.getObject("p50", Double.class), (Double) rs.getObject("p75", Double.class),
                        (Double) rs.getObject("max_v", Double.class), (Double) rs.getObject("mean_v", Double.class)))
                .single();
    }

    /** Per-year distribution across countries (only years where at least 20 countries reported). */
    public List<TrendPoint> trend(String key) {
        return jdbc.sql("""
                        select year, count(*) as n,
                               percentile_cont(0.5) within group (order by value) as median,
                               avg(value) as mean, min(value) as min_v, max(value) as max_v
                        from indicator_value where indicator_key = :key
                        group by year having count(*) >= 20 order by year
                        """)
                .param("key", key)
                .query((rs, i) -> new TrendPoint(rs.getInt("year"), rs.getInt("n"), rs.getDouble("median"),
                        rs.getDouble("mean"), rs.getDouble("min_v"), rs.getDouble("max_v")))
                .list();
    }

    public record PairRow(String code, double x, double y) {}

    public record Correlation(Double r, List<PairRow> pairs) {}

    /** Latest x and y per country, joined, plus Pearson's r computed by PostgreSQL's corr() aggregate. */
    public Correlation correlation(String xKey, String yKey) {
        String x = LATEST.formatted("").replace(":key", ":x");
        String y = LATEST.formatted("").replace(":key", ":y");
        String join = "with x as (%s), y as (%s) ".formatted(x, y);
        List<PairRow> pairs = jdbc.sql(join + "select x.country_code, x.value as xv, y.value as yv from x join y using (country_code)")
                .param("x", xKey).param("y", yKey)
                .query((rs, i) -> new PairRow(rs.getString("country_code"), rs.getDouble("xv"), rs.getDouble("yv")))
                .list();
        Double r = jdbc.sql(join + "select corr(x.value, y.value) from x join y using (country_code)")
                .param("x", xKey).param("y", yKey)
                .query(Double.class).optional().orElse(null);
        return new Correlation(r, pairs);
    }

    public record ProfileRow(String key, int year, double value, int rank, int of) {}

    /**
     * Latest value of every indicator for one country plus its world rank, in one query:
     * DISTINCT ON picks each country's latest value, the window functions rank them per indicator.
     * Only real countries take part (World Bank aggregates such as "WLD" are not in the country table).
     */
    public List<ProfileRow> profile(String countryCode) {
        return jdbc.sql("""
                        with latest as (
                            select distinct on (indicator_key, country_code) indicator_key, country_code, year, value
                            from indicator_value
                            where country_code in (select code from country)
                            order by indicator_key, country_code, year desc
                        ), ranked as (
                            select latest.*,
                                   rank() over (partition by indicator_key order by value desc) as rnk,
                                   count(*) over (partition by indicator_key) as total
                            from latest
                        )
                        select indicator_key, year, value, rnk, total from ranked where country_code = :code
                        """)
                .param("code", countryCode)
                .query((rs, i) -> new ProfileRow(rs.getString("indicator_key"), rs.getInt("year"),
                        rs.getDouble("value"), rs.getInt("rnk"), rs.getInt("total")))
                .list();
    }

    public Map<String, Coverage> coverage() {
        Map<String, Coverage> out = new LinkedHashMap<>();
        jdbc.sql("""
                        select indicator_key, count(distinct country_code) as countries, count(*) as n,
                               min(year) as from_year, max(year) as to_year, max(updated_at) as last_updated
                        from indicator_value group by indicator_key
                        """)
                .query((rs, i) -> {
                    Timestamp ts = rs.getTimestamp("last_updated");
                    out.put(rs.getString("indicator_key"), new Coverage(rs.getInt("countries"), rs.getLong("n"),
                            rs.getInt("from_year"), rs.getInt("to_year"), ts == null ? null : ts.toInstant()));
                    return null;
                }).list();
        return out;
    }

    public long count() {
        return jdbc.sql("select count(*) from indicator_value").query(Long.class).single();
    }
}
