package dev.worldexplorer.activity;

import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregation;
import co.elastic.clients.elasticsearch._types.aggregations.CalendarInterval;
import co.elastic.clients.elasticsearch._types.aggregations.DateHistogramBucket;
import co.elastic.clients.elasticsearch._types.aggregations.StringTermsBucket;
import co.elastic.clients.json.JsonData;
import dev.worldexplorer.atlas.FavoriteRepository;
import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.client.elc.ElasticsearchAggregations;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.stereotype.Service;

/** Reads the activity log: public feed and analytics via Elasticsearch aggregations. */
@Service
public class ActivityService {

    public record FeedItem(String id, String type, String userName, String countryCode, Integer score, String summary,
            Instant at) {}

    public record DayBucket(String day, long total, Map<String, Long> byType, Double avgQuizScore) {}

    public record CountryActivity(String code, String name, long count) {}

    public record Popular(List<CountryActivity> mostFavorited, List<CountryActivity> mostActive) {}

    private final ElasticsearchOperations es;
    private final FavoriteRepository favorites;
    private final CountryCatalog countries;

    public ActivityService(ElasticsearchOperations es, FavoriteRepository favorites, CountryCatalog countries) {
        this.es = es;
        this.favorites = favorites;
        this.countries = countries;
    }

    /** Newest public events (sorted by time, filtered by the isPublic flag). */
    public List<FeedItem> recent(int limit) {
        NativeQuery q = NativeQuery.builder()
                .withQuery(root -> root.term(t -> t.field("isPublic").value(true)))
                .withSort(s -> s.field(f -> f.field("at").order(SortOrder.Desc)))
                .withMaxResults(Math.max(1, Math.min(limit, 50)))
                .build();
        return es.search(q, ActivityDocument.class).getSearchHits().stream().map(h -> {
            ActivityDocument d = h.getContent();
            return new FeedItem(d.id(), d.type(), d.userName(), d.countryCode(), d.score(), d.summary(), d.at());
        }).toList();
    }

    /**
     * Events per day for the last {@code days} days: a {@code date_histogram} with two sub-aggregations
     * per day – a {@code terms} breakdown by event type and the {@code avg} quiz score.
     */
    public List<DayBucket> perDay(int days) {
        int d = Math.max(1, Math.min(days, 90));
        NativeQuery q = NativeQuery.builder()
                .withQuery(root -> root.range(r -> r.untyped(u -> u.field("at").gte(JsonData.of("now-" + d + "d/d")))))
                .withAggregation("perDay", Aggregation.of(a -> a
                        .dateHistogram(h -> h.field("at").calendarInterval(CalendarInterval.Day).format("yyyy-MM-dd")
                                .minDocCount(0))
                        .aggregations("byType", sub -> sub.terms(t -> t.field("type").size(20)))
                        .aggregations("avgScore", sub -> sub.avg(avg -> avg.field("score")))))
                .withMaxResults(0) // aggregations only, no hits
                .build();
        SearchHits<ActivityDocument> hits = es.search(q, ActivityDocument.class);
        Aggregate perDay = aggregate(hits, "perDay");
        List<DayBucket> out = new ArrayList<>();
        if (perDay == null || !perDay.isDateHistogram()) return out;
        for (DateHistogramBucket b : perDay.dateHistogram().buckets().array()) {
            Map<String, Long> byType = new LinkedHashMap<>();
            Aggregate types = b.aggregations().get("byType");
            if (types != null && types.isSterms()) {
                for (StringTermsBucket t : types.sterms().buckets().array()) byType.put(t.key().stringValue(), t.docCount());
            }
            Aggregate avg = b.aggregations().get("avgScore");
            Double avgScore = avg != null && avg.isAvg() && avg.avg().value() != null ? avg.avg().value() : null;
            if (avgScore != null && (avgScore.isNaN() || avgScore.isInfinite())) avgScore = null;
            out.add(new DayBucket(b.keyAsString(), b.docCount(), byType, avgScore));
        }
        return out;
    }

    /** Most favourited (PostgreSQL) and most active countries in the last 7 days (Elasticsearch terms agg). */
    public Popular popular(int limit) {
        int n = Math.max(1, Math.min(limit, 25));
        List<CountryActivity> fav = favorites.mostFavorited(PageRequest.of(0, n)).stream()
                .map(c -> countryActivity(c.countryCode(), c.count())).toList();

        NativeQuery q = NativeQuery.builder()
                .withQuery(root -> root.range(r -> r.untyped(u -> u.field("at").gte(JsonData.of("now-7d/d")))))
                .withAggregation("countries", Aggregation.of(a -> a.terms(t -> t.field("countryCode").size(n))))
                .withMaxResults(0)
                .build();
        Aggregate agg = aggregate(es.search(q, ActivityDocument.class), "countries");
        List<CountryActivity> active = new ArrayList<>();
        if (agg != null && agg.isSterms()) {
            for (StringTermsBucket b : agg.sterms().buckets().array()) {
                active.add(countryActivity(b.key().stringValue(), b.docCount()));
            }
        }
        return new Popular(fav, active);
    }

    public long count() {
        return es.count(NativeQuery.builder().withQuery(q -> q.matchAll(m -> m)).build(), ActivityDocument.class);
    }

    private CountryActivity countryActivity(String code, long count) {
        return new CountryActivity(code, countries.find(code).map(Country::getName).orElse(code), count);
    }

    private static Aggregate aggregate(SearchHits<?> hits, String name) {
        if (!(hits.getAggregations() instanceof ElasticsearchAggregations aggs)) return null;
        var a = aggs.aggregationsAsMap().get(name);
        return a == null ? null : a.aggregation().getAggregate();
    }
}
