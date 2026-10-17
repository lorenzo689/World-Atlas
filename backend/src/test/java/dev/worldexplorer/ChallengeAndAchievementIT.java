package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.common.redis.RedisJson;
import dev.worldexplorer.quiz.QuizSession;
import dev.worldexplorer.support.IntegrationTest;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

/** Duels (same questions for everybody), badges from Kafka events, and the transactional outbox. */
class ChallengeAndAchievementIT extends IntegrationTest {

    @Autowired
    RedisJson redis;

    @Autowired
    JdbcClient jdbc;

    @Test
    void duelGivesEveryoneTheSameQuestionsAndRanksThem() {
        String alice = newUser();
        String bob = guest("Bob");

        JsonNode duel = post("/api/challenges", alice, Map.of("rounds", 5)).getBody();
        String slug = duel.get("slug").asString();
        assertThat(get("/api/challenges/" + slug, null).getStatusCode()).isEqualTo(HttpStatus.OK); // public

        String quizA = post("/api/quiz", alice, Map.of("mode", "CHALLENGE", "challenge", slug)).getBody().get("id").asString();
        String quizB = post("/api/quiz", bob, Map.of("mode", "CHALLENGE", "challenge", slug)).getBody().get("id").asString();
        var questionsA = redis.get("quiz:session:" + quizA, QuizSession.class).orElseThrow().questions();
        var questionsB = redis.get("quiz:session:" + quizB, QuizSession.class).orElseThrow().questions();
        assertThat(questionsA).isEqualTo(questionsB);

        // one attempt per player
        assertThat(post("/api/quiz", alice, Map.of("mode", "CHALLENGE", "challenge", slug)).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        playAll(alice, quizA, true);
        playAll(bob, quizB, false);

        JsonNode view = get("/api/challenges/" + slug, alice).getBody();
        assertThat(view.get("played").asBoolean()).isTrue();
        assertThat(view.get("results")).hasSize(2);
        assertThat(view.get("results").get(0).get("name").asString()).isEqualTo("Tester"); // alice answered correctly
        assertThat(get("/api/quiz/" + quizA, alice).getBody().get("challenge").asString()).isEqualTo(slug);
    }

    @Test
    void perfectGameUnlocksBadgesThroughKafka() {
        String token = newUser();
        String id = post("/api/quiz", token, Map.of("mode", "CLASSIC")).getBody().get("id").asString();
        playAll(token, id, true);

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            JsonNode overview = get("/api/achievements", token).getBody();
            List<String> unlocked = overview.get("achievements").valueStream()
                    .filter(a -> a.get("unlocked").asBoolean()).map(a -> a.get("code").asString()).toList();
            assertThat(unlocked).contains("FIRST_QUIZ", "PERFECT_GAME");
        });

        // the badge itself is a domain event that reaches the public activity feed
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            JsonNode feed = get("/api/activity/recent?limit=50", null).getBody();
            assertThat(feed.findValuesAsString("type")).contains("achievement.unlocked");
        });
    }

    @Test
    void outboxRowsAreRelayedAndMarkedSent() {
        newUser(); // publishes user.registered through the outbox
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(
                jdbc.sql("select count(*) from outbox_event where sent_at is null").query(Long.class).single()).isZero());
        assertThat(jdbc.sql("select count(*) from outbox_event where sent_at is not null").query(Long.class).single())
                .isPositive();
    }

    private void playAll(String token, String quizId, boolean correct) {
        QuizSession session = redis.get("quiz:session:" + quizId, QuizSession.class).orElseThrow();
        for (int i = 0; i < session.questions().size(); i++) {
            get("/api/quiz/" + quizId + "/question", token);
            var q = session.questions().get(i);
            String answer = correct ? q.answer() : (q.options().isEmpty() ? "ATA" : wrongOption(q));
            post("/api/quiz/" + quizId + "/answer", token, Map.of("index", i, "answer", answer));
        }
    }

    private static String wrongOption(dev.worldexplorer.quiz.engine.Question q) {
        return q.options().stream().map(o -> o.id()).filter(id -> !id.equals(q.answer())).findFirst().orElseThrow();
    }
}
