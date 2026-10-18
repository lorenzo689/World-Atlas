package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
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
        // the refresh token is not in the body, only in an HttpOnly cookie
        assertThat(login.getBody().has("refreshToken")).isFalse();
        String setCookie = login.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains("we_refresh=", "HttpOnly", "SameSite=Strict", "Path=/api/auth");
        String cookie = setCookie.substring(0, setCookie.indexOf(';'));

        assertThat(http.post().uri("/api/auth/refresh").header(HttpHeaders.COOKIE, cookie)
                .header(HttpHeaders.ORIGIN, "https://untrusted.example")
                .retrieve().toEntity(JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(http.post().uri("/api/auth/refresh").header(HttpHeaders.COOKIE, cookie)
                .retrieve().toEntity(JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        var refreshed = refreshWithCookie(cookie);
        assertThat(refreshed.getStatusCode()).isEqualTo(HttpStatus.OK);
        // refresh tokens rotate: the old one is single-use
        assertThat(refreshWithCookie(cookie).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        var me = get("/api/auth/me", refreshed.getBody().get("accessToken").asString());
        assertThat(me.getBody().get("displayName").asString()).isEqualTo("Mia");
    }

    @Test
    void emailVerificationAndPasswordReset() {
        String email = "reset-" + java.util.UUID.randomUUID() + "@test.dev";
        String token = register(email);
        assertThat(get("/api/auth/me", token).getBody().get("emailVerified").asBoolean()).isFalse();

        // verification link from the (dev) mailbox
        String verifyToken = linkToken(email, "verify?token=");
        var verified = post("/api/auth/verify", null, Map.of("token", verifyToken));
        assertThat(verified.getBody().get("user").get("emailVerified").asBoolean()).isTrue();
        assertThat(post("/api/auth/verify", null, Map.of("token", verifyToken)).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST); // single use

        // unknown addresses get the same answer as known ones
        assertThat(post("/api/auth/forgot-password", null, Map.of("email", "nobody@test.dev")).getStatusCode())
                .isEqualTo(HttpStatus.ACCEPTED);
        assertThat(post("/api/auth/forgot-password", null, Map.of("email", email)).getStatusCode())
                .isEqualTo(HttpStatus.ACCEPTED);
        String resetToken = linkToken(email, "reset-password?token=");
        var reset = post("/api/auth/reset-password", null, Map.of("token", resetToken, "password", "brand-new-pass"));
        assertThat(reset.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post("/api/auth/login", null, Map.of("email", email, "password", "password123")).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(post("/api/auth/login", null, Map.of("email", email, "password", "brand-new-pass")).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void adminsManageRoles() {
        String admin = register("roles-admin-" + java.util.UUID.randomUUID() + "@test.dev");
        // only the configured bootstrap address is admin
        assertThat(get("/api/admin/users", admin).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/admin/events/outbox", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/admin/events/outbox", guest("Operator")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/admin/events/outbox", admin).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(post("/api/admin/events/outbox/00000000-0000-0000-0000-000000000001/retry", admin, null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    private org.springframework.http.ResponseEntity<JsonNode> refreshWithCookie(String cookie) {
        return http.post().uri("/api/auth/refresh").header(HttpHeaders.COOKIE, cookie)
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .retrieve().toEntity(JsonNode.class);
    }

    /** Reads the newest e-mail to {@code email} from the dev mailbox and extracts the token after {@code marker}. */
    private String linkToken(String email, String marker) {
        JsonNode mails = get("/api/dev/mails", null).getBody();
        for (JsonNode m : mails) {
            String body = m.get("body").asString();
            if (m.get("to").asString().equals(email) && body.contains(marker)) {
                String rest = body.substring(body.indexOf(marker) + marker.length());
                return rest.split("\\s")[0];
            }
        }
        throw new AssertionError("no mail with " + marker + " for " + email);
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
