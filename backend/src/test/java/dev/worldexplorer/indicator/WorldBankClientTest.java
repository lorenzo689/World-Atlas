package dev.worldexplorer.indicator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.worldexplorer.common.config.AppProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class WorldBankClientTest {

    private final WorldBankClient client = new WorldBankClient(RestClient.builder(),
            new AppProperties(null, null,
                    new AppProperties.Ingestion("http://localhost", 1990, false, false, Duration.ofMinutes(1)),
                    null, null, null, List.of()),
            JsonMapper.builder().build(), new SimpleMeterRegistry());

    @Test
    void parsesRowsAndSkipsNullsAndAggregates() {
        String body = """
                [{"page":1,"pages":3,"per_page":2,"total":5},
                 [{"countryiso3code":"DEU","date":"2023","value":84482267},
                  {"countryiso3code":"FRA","date":"2023","value":null},
                  {"countryiso3code":"","date":"2023","value":1},
                  {"countryiso3code":"ITA","date":"2022","value":58940425.5}]]
                """;
        List<WorldBankClient.Row> rows = new ArrayList<>();
        int pages = client.parsePage(body, rows);
        assertThat(pages).isEqualTo(3);
        assertThat(rows).containsExactly(
                new WorldBankClient.Row("DEU", 2023, 84482267),
                new WorldBankClient.Row("ITA", 2022, 58940425.5));
    }

    @Test
    void reportsApiErrors() {
        String body = """
                [{"message":[{"id":"120","key":"Invalid value","value":"The provided parameter value is not valid"}]}]
                """;
        assertThatThrownBy(() -> client.parsePage(body, new ArrayList<>()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("World Bank error");
    }
}
