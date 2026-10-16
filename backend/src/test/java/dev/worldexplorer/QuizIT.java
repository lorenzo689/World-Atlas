package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.common.redis.RedisJson;
import dev.worldexplorer.quiz.QuizSession;
import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

class QuizIT extends IntegrationTest {

    @Autowired
    RedisJson redis;

    @Test
    void perfectGameReachesTheLeaderboardAndStatistics() {
        String token = newUser();
        JsonNode start = post("/api/quiz", token, Map.of("mode", "CLASSIC")).getBody();
        String id = start.get("id").asString();
        assertThat(start.get("ranked").asBoolean()).isTrue();

        // another user may not play this quiz
        assertThat(get("/api/quiz/" + id + "/question", newUser()).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        // white-box: read the answers from the Redis session (the API never reveals them)
        QuizSession session = redis.get("quiz:session:" + id, QuizSession.class).orElseThrow();
        for (int i = 0; i < session.questions().size(); i++) {
            JsonNode q = get("/api/quiz/" + id + "/question", token).getBody();
            assertThat(q.get("question").has("answer")).isFalse();
            if (q.get("question").get("hasFlag").asBoolean()) {
                var flag = http.get().uri("/api/quiz/" + id + "/questions/" + i + "/flag")
                        .headers(h -> h.setBearerAuth(token)).retrieve().toEntity(String.class);
                assertThat(flag.getBody()).contains("<svg");
            }
            JsonNode result = post("/api/quiz/" + id + "/answer", token,
                    Map.of("index", i, "answer", session.questions().get(i).answer())).getBody();
            assertThat(result.get("correct").asBoolean()).isTrue();
        }

        // answering again is rejected
        assertThat(post("/api/quiz/" + id + "/answer", token, Map.of("index", 9, "answer", "DEU")).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        JsonNode summary = get("/api/quiz/" + id, token).getBody();
        assertThat(summary.get("correct").asInt()).isEqualTo(10);
        assertThat(summary.get("score").asInt()).isGreaterThanOrEqualTo(10_000);
        assertThat(summary.get("weeklyRank").asInt()).isGreaterThanOrEqualTo(1);

        JsonNode board = get("/api/leaderboard?period=weekly", token).getBody();
        assertThat(board.get("me").get("score").asInt()).isEqualTo(summary.get("score").asInt());

        // statistics are a Kafka projection: eventually consistent
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            JsonNode stats = get("/api/quiz/me/stats", token).getBody();
            assertThat(stats.get("games").asInt()).isEqualTo(1);
            assertThat(stats.get("correct").asInt()).isEqualTo(10);
        });
    }

    @Test
    void dailyChallengeIsTheSameForEveryoneAndOnlyOnce() {
        String a = newUser();
        String b = newUser();
        String idA = post("/api/quiz", a, Map.of("mode", "DAILY")).getBody().get("id").asString();
        String idB = post("/api/quiz", b, Map.of("mode", "DAILY")).getBody().get("id").asString();
        var qa = redis.get("quiz:session:" + idA, QuizSession.class).orElseThrow().questions();
        var qb = redis.get("quiz:session:" + idB, QuizSession.class).orElseThrow().questions();
        assertThat(qa).isEqualTo(qb);

        var again = post("/api/quiz", a, Map.of("mode", "DAILY"));
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(again.getBody().get("code").asString()).isEqualTo("daily_played");
    }

    @Test
    void answersMustBeForTheCurrentQuestion() {
        String token = guest("Speedy");
        String id = post("/api/quiz", token, Map.of("mode", "CLASSIC", "rounds", 5)).getBody().get("id").asString();
        assertThat(post("/api/quiz/" + id + "/answer", token, Map.of("index", 0, "answer", "DEU")).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT); // not served yet
        get("/api/quiz/" + id + "/question", token);
        assertThat(post("/api/quiz/" + id + "/answer", token, Map.of("index", 3, "answer", "DEU")).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT); // wrong index
    }
}
