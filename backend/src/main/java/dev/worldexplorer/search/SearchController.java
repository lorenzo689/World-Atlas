package dev.worldexplorer.search;

import dev.worldexplorer.search.SearchDtos.CountrySearchResult;
import dev.worldexplorer.search.SearchDtos.NearbyHit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Search", description = "Elasticsearch-backed full-text and geo search")
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService search;

    public SearchController(SearchService search) {
        this.search = search;
    }

    @Operation(summary = "Fuzzy, accent-insensitive country search with region facet and highlights")
    @GetMapping
    CountrySearchResult search(@RequestParam String q, @RequestParam(required = false) String region,
            @RequestParam(defaultValue = "10") int limit) {
        return search.searchCountries(q, region, limit);
    }

    @Operation(summary = "Countries near a point, nearest first")
    @GetMapping("/nearby")
    List<NearbyHit> nearby(@RequestParam double lat, @RequestParam double lng,
            @RequestParam(defaultValue = "1500") double km, @RequestParam(defaultValue = "10") int limit) {
        return search.nearby(lat, lng, km, limit);
    }
}
