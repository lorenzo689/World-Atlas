package dev.worldexplorer.indicator;

import dev.worldexplorer.common.config.AppProperties;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.resilience.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Client for the World Bank Indicators API (https://datahelpdesk.worldbank.org/knowledgebase/articles/889392).
 *
 * <p>{@code @Retryable} (Spring Framework 7 core resilience, enabled by {@code @EnableResilientMethods})
 * retries transient failures with exponential back-off: 1 s, 2 s, 4 s.
 */
@Component
public class WorldBankClient {

    /** One row from the API. Aggregates (regions like "WLD") are filtered out later by country code. */
    public record Row(String countryCode, int year, double value) {}

    private final RestClient http;
    private final JsonMapper json;
    private final Timer timer;

    public WorldBankClient(RestClient.Builder builder, AppProperties props, JsonMapper json, MeterRegistry meters) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(60));
        this.http = builder.baseUrl(props.ingestion().worldBankBaseUrl()).requestFactory(factory).build();
        this.json = json;
        this.timer = Timer.builder("worldbank.fetch").description("World Bank API fetch duration").register(meters);
    }

    @Retryable(maxRetries = 3, delay = 1000, multiplier = 2)
    public List<Row> fetchAll(String worldBankId, int fromYear) {
        return timer.record(() -> {
            List<Row> rows = new ArrayList<>();
            int page = 1;
            int pages;
            do {
                String body = http.get()
                        .uri("/country/all/indicator/{id}?format=json&per_page=20000&date={from}:{to}&page={page}",
                                worldBankId, fromYear, Year.now().getValue(), page)
                        .retrieve()
                        .body(String.class);
                pages = parsePage(body, rows);
                page++;
            } while (page <= pages);
            return rows;
        });
    }

    /** Parses one page into {@code out}; returns the total number of pages. */
    int parsePage(String body, List<Row> out) {
        JsonNode root = json.readTree(body);
        if (!root.isArray() || root.isEmpty()) throw new IllegalStateException("Unexpected World Bank response");
        JsonNode meta = root.get(0);
        if (meta.has("message")) {
            throw new IllegalStateException("World Bank error: " + meta.get("message").toString());
        }
        JsonNode data = root.size() > 1 ? root.get(1) : null;
        if (data != null && data.isArray()) {
            for (JsonNode r : data) {
                JsonNode value = r.get("value");
                String code = r.path("countryiso3code").asString("");
                if (value == null || value.isNull() || code.length() != 3) continue;
                out.add(new Row(code, Integer.parseInt(r.path("date").asString("0")), value.asDouble()));
            }
        }
        return meta.path("pages").asInt(1);
    }
}
