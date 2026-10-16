package dev.worldexplorer.search;

import co.elastic.clients.elasticsearch._types.DistanceUnit;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregation;
import co.elastic.clients.elasticsearch._types.query_dsl.Operator;
import co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.search.SearchDtos.CountryHit;
import dev.worldexplorer.search.SearchDtos.CountrySearchResult;
import dev.worldexplorer.search.SearchDtos.NearbyHit;
import dev.worldexplorer.search.SearchDtos.NoteHit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.elasticsearch.client.elc.ElasticsearchAggregations;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.HighlightQuery;
import org.springframework.data.elasticsearch.core.query.highlight.Highlight;
import org.springframework.data.elasticsearch.core.query.highlight.HighlightField;
import org.springframework.data.elasticsearch.core.query.highlight.HighlightParameters;
import org.springframework.stereotype.Service;

/**
 * Elasticsearch queries, written with the typed query DSL of the Elasticsearch Java client.
 */
@Service
public class SearchService {

    private final ElasticsearchOperations es;

    public SearchService(ElasticsearchOperations es) {
        this.es = es;
    }

    /**
     * Ranked country search. One {@code bool} query combines:
     * <ul>
     *   <li>exact code match (DE / DEU) – boosted highest
     *   <li>prefix-style match on name and capital via the edge-n-gram sub-fields ("germ" → Germany)
     *   <li>fuzzy match on name, official name, capital, languages, currencies ("germny" → Germany)
     * </ul>
     * An optional region filter does not affect the score; the region facet is a terms aggregation.
     */
    public CountrySearchResult searchCountries(String text, String region, int limit) {
        String q = text == null ? "" : text.trim();
        if (q.isEmpty()) throw ApiException.badRequest("empty_query", "Type something to search for.");
        NativeQuery query = NativeQuery.builder()
                .withQuery(root -> root.bool(b -> {
                    b.should(s -> s.term(t -> t.field("code").value(q.toUpperCase()).boost(10f)));
                    b.should(s -> s.term(t -> t.field("code2").value(q.toUpperCase()).boost(8f)));
                    b.should(s -> s.multiMatch(m -> m.query(q)
                            .fields("name.auto^4", "capitals.auto^2")
                            .type(TextQueryType.BestFields)
                            .operator(Operator.And)));
                    b.should(s -> s.multiMatch(m -> m.query(q)
                            .fields("name^5", "officialName^2", "capitals^3", "languages", "currencies")
                            .fuzziness("AUTO")
                            .prefixLength(1)));
                    b.minimumShouldMatch("1");
                    if (region != null && !region.isBlank()) b.filter(f -> f.term(t -> t.field("region").value(region)));
                    return b;
                }))
                .withAggregation("regions", Aggregation.of(a -> a.terms(t -> t.field("region").size(10))))
                .withHighlightQuery(new HighlightQuery(new Highlight(
                        HighlightParameters.builder().withPreTags("<mark>").withPostTags("</mark>").build(),
                        List.of(new HighlightField("name"), new HighlightField("capitals"), new HighlightField("languages"))),
                        CountryDocument.class))
                .withMaxResults(Math.max(1, Math.min(limit, 50)))
                .build();

        SearchHits<CountryDocument> hits = es.search(query, CountryDocument.class);
        List<CountryHit> results = hits.getSearchHits().stream().map(SearchService::toHit).toList();
        return new CountrySearchResult(q, hits.getTotalHits(), results, regionFacet(hits));
    }

    /** Countries whose centre lies within {@code km} of a point, nearest first (geo_distance query + sort). */
    public List<NearbyHit> nearby(double lat, double lng, double km, int limit) {
        NativeQuery query = NativeQuery.builder()
                .withQuery(root -> root.geoDistance(g -> g.field("location")
                        .distance(km + "km")
                        .location(l -> l.latlon(ll -> ll.lat(lat).lon(lng)))))
                .withSort(s -> s.geoDistance(g -> g.field("location")
                        .location(l -> l.latlon(ll -> ll.lat(lat).lon(lng)))
                        .unit(DistanceUnit.Kilometers)
                        .order(SortOrder.Asc)))
                .withMaxResults(Math.max(1, Math.min(limit, 50)))
                .build();
        return es.search(query, CountryDocument.class).getSearchHits().stream()
                .map(h -> new NearbyHit(h.getContent().code(), h.getContent().name(), h.getContent().region(),
                        h.getSortValues().isEmpty() ? 0 : ((Number) h.getSortValues().getFirst()).doubleValue()))
                .toList();
    }

    /** Full-text search in the caller's own notes. */
    public List<NoteHit> searchNotes(UUID userId, String text, int limit) {
        String q = text == null ? "" : text.trim();
        if (q.isEmpty()) return List.of();
        NativeQuery query = NativeQuery.builder()
                .withQuery(root -> root.bool(b -> b
                        .filter(f -> f.term(t -> t.field("userId").value(userId.toString())))
                        .must(m -> m.multiMatch(mm -> mm.query(q)
                                .fields("title^3", "body", "countryName^2")
                                .fuzziness("AUTO")))))
                .withHighlightQuery(new HighlightQuery(new Highlight(
                        HighlightParameters.builder().withPreTags("<mark>").withPostTags("</mark>")
                                .withFragmentSize(120).withNumberOfFragments(1).build(),
                        List.of(new HighlightField("body"), new HighlightField("title"))), NoteDocument.class))
                .withMaxResults(Math.max(1, Math.min(limit, 50)))
                .build();
        return es.search(query, NoteDocument.class).getSearchHits().stream().map(h -> {
            NoteDocument d = h.getContent();
            List<String> body = h.getHighlightField("body");
            String snippet = !body.isEmpty() ? body.getFirst()
                    : d.body().substring(0, Math.min(d.body().length(), 120));
            return new NoteHit(d.id(), d.countryCode(), d.countryName(), d.title(), snippet, d.updatedAt(), h.getScore());
        }).toList();
    }

    private static CountryHit toHit(SearchHit<CountryDocument> h) {
        CountryDocument d = h.getContent();
        String capital = d.capitals() == null || d.capitals().isEmpty() ? null : d.capitals().getFirst();
        return new CountryHit(d.code(), d.name(), capital, d.region(), d.flagEmoji(), h.getScore(), h.getHighlightFields());
    }

    private static Map<String, Long> regionFacet(SearchHits<CountryDocument> hits) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (hits.getAggregations() instanceof ElasticsearchAggregations aggs) {
            var regions = aggs.aggregationsAsMap().get("regions");
            if (regions != null) {
                Aggregate agg = regions.aggregation().getAggregate();
                if (agg.isSterms()) {
                    agg.sterms().buckets().array().forEach(b -> out.put(b.key().stringValue(), b.docCount()));
                }
            }
        }
        return out;
    }
}
