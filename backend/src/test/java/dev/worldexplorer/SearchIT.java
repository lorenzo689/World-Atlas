package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class SearchIT extends IntegrationTest {

    @BeforeEach
    void countriesAreIndexed() {
        // indexing runs asynchronously after the countries were seeded at startup
        await().atMost(Duration.ofSeconds(60)).until(() -> get("/api/search?q=germany", null).getBody().get("total").asLong() > 0);
    }

    @Test
    void typosAccentsAndPrefixes() {
        assertThat(first("germny")).isEqualTo("DEU");      // fuzzy
        assertThat(first("ger")).isEqualTo("DEU");         // edge n-gram prefix
        assertThat(first("bogota")).isEqualTo("COL");      // capital, accent folding (Bogotá)
        assertThat(first("de")).isEqualTo("DEU");          // alpha-2 code
    }

    @Test
    void regionFacetAndFilter() {
        JsonNode res = get("/api/search?q=guinea", null).getBody();
        assertThat(res.get("regions").has("Africa")).isTrue();
        JsonNode oceania = get("/api/search?q=guinea&region=Oceania", null).getBody();
        assertThat(oceania.get("hits").get(0).get("code").asString()).isEqualTo("PNG");
    }

    @Test
    void nearbyIsSortedByDistance() {
        JsonNode near = get("/api/search/nearby?lat=48.14&lng=11.58&km=600&limit=3", null).getBody(); // Munich
        assertThat(near.get(0).get("code").asString()).isIn("DEU", "AUT");
        assertThat(near.get(0).get("distanceKm").asDouble()).isLessThan(near.get(1).get("distanceKm").asDouble());
    }

    private String first(String q) {
        return get("/api/search?q=" + q, null).getBody().get("hits").get(0).get("code").asString();
    }
}
