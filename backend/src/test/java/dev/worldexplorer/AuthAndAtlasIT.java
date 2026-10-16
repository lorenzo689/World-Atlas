package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

class AuthAndAtlasIT extends IntegrationTest {

    @Test
    void registerLoginRefreshAndMe() {
        var reg = post("/api/auth/register", null,
                Map.of("email", "Mia@Test.dev", "password", "password123", "displayName", "Mia"));
        assertThat(reg.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        // e-mails are case-insensitive
        var duplicate = post("/api/auth/register", null,
                Map.of("email", "mia@test.dev", "password", "password123", "displayName", "Mia2"));
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(duplicate.getBody().get("code").asString()).isEqualTo("email_taken");

        var wrong = post("/api/auth/login", null, Map.of("email", "mia@test.dev", "password", "nope-nope"));
        assertThat(wrong.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        var login = post("/api/auth/login", null, Map.of("email", "mia@test.dev", "password", "password123"));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        String refresh = login.getBody().get("refreshToken").asString();

        var refreshed = post("/api/auth/refresh", null, Map.of("refreshToken", refresh));
        assertThat(refreshed.getStatusCode()).isEqualTo(HttpStatus.OK);
        // refresh tokens rotate: the old one is single-use
        assertThat(post("/api/auth/refresh", null, Map.of("refreshToken", refresh)).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        var me = get("/api/auth/me", refreshed.getBody().get("accessToken").asString());
        assertThat(me.getBody().get("displayName").asString()).isEqualTo("Mia");
    }

    @Test
    void validationErrorsAreProblemDetailsWithFields() {
        var res = post("/api/auth/register", null, Map.of("email", "bad", "password", "1", "displayName", "x"));
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody().get("code").asString()).isEqualTo("validation_failed");
        assertThat(res.getBody().get("fields").propertyNames()).contains("email", "password", "displayName");
    }

    @Test
    void atlasRequiresAnAccountNotAGuest() {
        assertThat(get("/api/atlas/favorites", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/atlas/favorites", guest("Visitor")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void favouritesTravelNotesAndStats() {
        String token = newUser();

        assertThat(put("/api/atlas/favorites/jpn", token, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(put("/api/atlas/favorites/JPN", token, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT); // idempotent
        assertThat(get("/api/atlas/favorites", token).getBody()).hasSize(1);
        assertThat(put("/api/atlas/favorites/XXX", token, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        put("/api/atlas/travel/ITA", token, Map.of("status", "VISITED", "visitedOn", "2024-05-01", "rating", 5));
        put("/api/atlas/travel/FRA", token, Map.of("status", "LIVED"));
        put("/api/atlas/travel/PER", token, Map.of("status", "WISHLIST"));
        var wishlistWithRating = put("/api/atlas/travel/CHL", token, Map.of("status", "WISHLIST", "rating", 4));
        assertThat(wishlistWithRating.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        JsonNode stats = get("/api/atlas/stats", token).getBody();
        assertThat(stats.get("visited").asInt()).isEqualTo(2);
        assertThat(stats.get("lived").asInt()).isEqualTo(1);
        assertThat(stats.get("wishlist").asInt()).isEqualTo(1);
        assertThat(stats.get("byRegion").get("Europe").get("visited").asInt()).isEqualTo(2);

        JsonNode state = get("/api/atlas/countries/JPN", token).getBody();
        assertThat(state.get("favorite").asBoolean()).isTrue();
    }

    @Test
    void notesUseOptimisticLockingAndAreSearchable() {
        String token = newUser();
        JsonNode note = post("/api/atlas/notes", token,
                Map.of("countryCode", "NOR", "title", "Fjords", "body", "Hiking to Preikestolen at sunrise")).getBody();
        String id = note.get("id").asString();

        var update = put("/api/atlas/notes/" + id, token, Map.of("title", "Fjords!", "body", "Preikestolen", "version", 0));
        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(update.getBody().get("version").asLong()).isEqualTo(1);

        // a second client still holding version 0 must not overwrite the change
        var stale = put("/api/atlas/notes/" + id, token, Map.of("title", "old", "body", "old", "version", 0));
        assertThat(stale.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(stale.getBody().get("code").asString()).isEqualTo("stale_version");

        // the note reaches Elasticsearch asynchronously: atlas.changed (Kafka) → NoteIndexer
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            JsonNode hits = get("/api/atlas/notes/search?q=preikestolen", token).getBody();
            assertThat(hits).hasSize(1);
            assertThat(hits.get(0).get("countryName").asString()).isEqualTo("Norway");
        });

        // other users never see it
        assertThat(get("/api/atlas/notes/search?q=preikestolen", newUser()).getBody()).isEmpty();
    }

    @Test
    void sharedViews() {
        String token = newUser();
        JsonNode view = post("/api/atlas/views", token, Map.of("name", "Alps", "mode", "political", "lat", 46.5,
                "lng", 10.0, "altitude", 0.6, "isPublic", true)).getBody();
        String slug = view.get("slug").asString();
        assertThat(get("/api/views/" + slug, null).getBody().get("name").asString()).isEqualTo("Alps");

        JsonNode secret = post("/api/atlas/views", token, Map.of("name", "Secret", "mode", "satellite", "lat", 0,
                "lng", 0, "altitude", 2, "isPublic", false)).getBody();
        assertThat(get("/api/views/" + secret.get("slug").asString(), null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(get("/api/views/" + secret.get("slug").asString(), token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
