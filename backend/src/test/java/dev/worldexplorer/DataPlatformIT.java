package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import dev.worldexplorer.indicator.IndicatorSource.Row;
import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

/** The ingestion pipeline end to end: World Bank (mocked) → Kafka → PostgreSQL → query API. */
class DataPlatformIT extends IntegrationTest {

    @Test
    void ingestsThroughKafkaAndServesAnalytics() {
        when(worldBank.fetchAll(eq("NY.GDP.PCAP.CD"), anyInt())).thenReturn(List.of(
                new Row("DEU", 2022, 48_000), new Row("DEU", 2023, 52_000),
                new Row("FRA", 2023, 44_000), new Row("LUX", 2023, 128_000),
                new Row("WLD", 2023, 13_000))); // aggregate, must be ignored
        when(worldBank.fetchAll(eq("SP.DYN.LE00.IN"), anyInt())).thenReturn(List.of(
                new Row("DEU", 2023, 81.0), new Row("FRA", 2023, 83.0), new Row("LUX", 2023, 82.5)));

        String unverifiedAdmin = register("admin@test.dev");
        assertThat(get("/api/admin/users", unverifiedAdmin).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/auth/me", unverifiedAdmin).getBody().get("roles").toString()).doesNotContain("ADMIN");
        JsonNode mails = get("/api/dev/mails", null).getBody();
        String verifyToken = null;
        for (JsonNode mail : mails) {
            if ("admin@test.dev".equals(mail.get("to").asString())) {
                String body = mail.get("body").asString();
                verifyToken = body.substring(body.indexOf("verify?token=") + "verify?token=".length()).split("\\s")[0];
                break;
            }
        }
        assertThat(verifyToken).isNotBlank();
        String admin = post("/api/auth/verify", null, Map.of("token", verifyToken)).getBody().get("accessToken").asString();
        assertThat(get("/api/admin/users", admin).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post("/api/admin/ingestion/gdpPerCapita", newUser(), null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN); // admins only
        assertThat(post("/api/admin/ingestion/gdpPerCapita", admin, null).getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(post("/api/admin/ingestion/lifeExpectancy", admin, null).getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);

        await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> {
            JsonNode runs = get("/api/admin/ingestion/runs", admin).getBody();
            assertThat(runs.findValuesAsString("status")).containsOnly("COMPLETED").hasSizeGreaterThanOrEqualTo(2);
        });

        JsonNode latest = get("/api/indicators/gdpPerCapita/latest", null).getBody().get("values");
        assertThat(latest.get("DEU").get("year").asInt()).isEqualTo(2023);
        assertThat(latest.has("WLD")).isFalse();

        JsonNode ranking = get("/api/indicators/gdpPerCapita/ranking?limit=2", null).getBody();
        assertThat(ranking.get(0).get("code").asString()).isEqualTo("LUX");
        assertThat(ranking.get(1).get("code").asString()).isEqualTo("DEU");

        JsonNode series = get("/api/indicators/gdpPerCapita/series?countries=DEU", null).getBody();
        assertThat(series.get("series").get(0).get("points")).hasSize(2);

        JsonNode stats = get("/api/indicators/gdpPerCapita/stats", null).getBody();
        assertThat(stats.get("countries").asInt()).isEqualTo(3);
        assertThat(stats.get("median").asDouble()).isEqualTo(52_000);

        JsonNode corr = get("/api/indicators/correlation?x=gdpPerCapita&y=lifeExpectancy", null).getBody();
        assertThat(corr.get("n").asInt()).isEqualTo(3);
        assertThat(corr.get("pearsonR").asDouble()).isBetween(-1.0, 1.0);

        JsonNode year2022 = get("/api/indicators/gdpPerCapita/at/2022", null).getBody().get("values");
        assertThat(year2022.get("DEU").get("value").asDouble()).isEqualTo(48_000);
        assertThat(year2022.has("FRA")).isFalse(); // France only reported 2023

        JsonNode profile = get("/api/indicators/countries/DEU", null).getBody();
        assertThat(profile.findValuesAsString("key")).contains("gdpPerCapita", "lifeExpectancy");
    }

    @Test
    void unknownIndicatorIs404() {
        assertThat(get("/api/indicators/nope/latest", null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
