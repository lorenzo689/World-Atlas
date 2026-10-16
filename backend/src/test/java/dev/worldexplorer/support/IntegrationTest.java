package dev.worldexplorer.support;

import dev.worldexplorer.indicator.WorldBankClient;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base class for integration tests: the whole application on a random port against real
 * PostgreSQL, Redis, Kafka and Elasticsearch containers. Only the World Bank (internet) is mocked.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig.class)
@TestPropertySource(properties = {
    "app.ingestion.bootstrap-on-startup=false",
    "app.ingestion.schedule-enabled=false",
    "app.multiplayer.countdown=1s",
    "app.multiplayer.result-pause=1s",
    "app.rate-limit.auth-per-minute=1000",
    "app.admin-emails=admin@test.dev"
})
public abstract class IntegrationTest {

    @LocalServerPort
    protected int port;

    @Autowired
    protected JsonMapper json;

    @MockitoBean
    protected WorldBankClient worldBank;

    protected RestClient http;

    @BeforeEach
    void setUpClient() {
        http = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .defaultStatusHandler(status -> true, (req, res) -> {}) // tests assert on status codes themselves
                .build();
    }

    /** Registers a fresh account and returns its access token. */
    protected String register(String email) {
        JsonNode body = post("/api/auth/register", null,
                Map.of("email", email, "password", "password123", "displayName", "Tester")).getBody();
        return body.get("accessToken").asString();
    }

    protected String newUser() {
        return register("user-" + UUID.randomUUID() + "@test.dev");
    }

    protected String guest(String name) {
        return post("/api/auth/guest", null, Map.of("displayName", name)).getBody().get("accessToken").asString();
    }

    protected ResponseEntity<JsonNode> get(String path, String token) {
        return http.get().uri(path).headers(h -> auth(h, token)).retrieve().toEntity(JsonNode.class);
    }

    protected ResponseEntity<JsonNode> post(String path, String token, Object body) {
        var spec = http.post().uri(path).headers(h -> auth(h, token)).contentType(MediaType.APPLICATION_JSON);
        if (body != null) spec.body(body);
        return spec.retrieve().toEntity(JsonNode.class);
    }

    protected ResponseEntity<JsonNode> put(String path, String token, Object body) {
        var spec = http.put().uri(path).headers(h -> auth(h, token)).contentType(MediaType.APPLICATION_JSON);
        if (body != null) spec.body(body);
        return spec.retrieve().toEntity(JsonNode.class);
    }

    private static void auth(HttpHeaders h, String token) {
        if (token != null) h.setBearerAuth(token);
    }
}
