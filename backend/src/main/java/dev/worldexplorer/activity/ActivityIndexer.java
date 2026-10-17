package dev.worldexplorer.activity;

import dev.worldexplorer.auth.AppUser;
import dev.worldexplorer.auth.AppUserRepository;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.search.IndexBootstrap;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A generic consumer of <em>all</em> domain topics. It reads the raw JSON (no Java types needed, see the
 * {@code rawJsonFactory}) and writes one {@link ActivityDocument} per event into Elasticsearch.
 * Its own consumer group means it gets every event independently of the other consumers
 * (Kafka's publish/subscribe: one topic, many independent readers).
 */
@Component
public class ActivityIndexer {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final ActivityRepository activity;
    private final AppUserRepository users;
    private final CountryCatalog countries;
    private final JsonMapper json;
    private final IndexBootstrap indices;

    public ActivityIndexer(ActivityRepository activity, AppUserRepository users, CountryCatalog countries, JsonMapper json,
            IndexBootstrap indices) {
        this.activity = activity;
        this.users = users;
        this.countries = countries;
        this.json = json;
        this.indices = indices;
    }

    @KafkaListener(id = "activity-indexer", groupId = "activity-indexer", containerFactory = "rawJsonFactory",
            topics = {Topics.INDICATOR_INGESTED, Topics.USER_REGISTERED, Topics.ATLAS_CHANGED, Topics.QUIZ_COMPLETED,
                Topics.MULTIPLAYER_FINISHED, Topics.ACHIEVEMENT_UNLOCKED})
    public void on(ConsumerRecord<String, String> record) {
        indices.ensure(ActivityDocument.class);
        JsonNode e = json.readTree(record.value());
        activity.save(toDocument(record.topic(), e));
    }

    ActivityDocument toDocument(String topic, JsonNode e) {
        String id = e.path("eventId").asString(UUID.randomUUID().toString());
        Instant at = e.hasNonNull("occurredAt") ? Instant.parse(e.get("occurredAt").asString()) : Instant.now();
        Map<String, Object> payload = json.convertValue(e, MAP);
        String userId = text(e, "userId");

        return switch (topic) {
            case Topics.QUIZ_COMPLETED -> {
                String name = text(e, "playerName");
                int score = e.path("score").asInt();
                String mode = "DAILY".equals(text(e, "mode")) ? "the daily challenge" : "a quiz";
                yield doc(id, "quiz.completed", topic, userId, name, null, score,
                        String.format(Locale.ROOT, "%s scored %,d points in %s (%d/%d correct)", name, score, mode,
                                e.path("correct").asInt(), e.path("total").asInt()), true, at, payload);
            }
            case Topics.MULTIPLAYER_FINISHED -> {
                JsonNode winner = e.path("placements").path(0);
                String name = winner.path("name").asString("?");
                yield doc(id, "multiplayer.finished", topic, winner.path("userId").asString(null), name, null,
                        winner.path("score").asInt(), "%s won a %d-player match".formatted(name,
                                e.path("placements").size()), true, at, payload);
            }
            case Topics.USER_REGISTERED -> {
                boolean guest = e.path("guest").asBoolean();
                String name = text(e, "displayName");
                yield doc(id, guest ? "user.guest" : "user.registered", topic, userId, name, null, null,
                        guest ? name + " joined as a guest" : name + " created an account", !guest, at, payload);
            }
            case Topics.ATLAS_CHANGED -> {
                String type = text(e, "type");
                String code = text(e, "countryCode");
                String country = code == null ? null : countries.find(code).map(Country::getName).orElse(code);
                boolean isPublic = "FAVORITE_ADDED".equals(type);
                yield doc(id, "atlas.changed:" + type, topic, userId, userName(userId), code, null,
                        isPublic ? "Someone added " + country + " to their favourites" : type, isPublic, at, payload);
            }
            case Topics.ACHIEVEMENT_UNLOCKED -> {
                String name = text(e, "userName");
                yield doc(id, "achievement.unlocked", topic, userId, name, null, null,
                        name + " earned the badge “" + text(e, "title") + "”", true, at, payload);
            }
            case Topics.INDICATOR_INGESTED -> doc(id, "indicator.ingested", topic, null, null, null, null,
                    "Data platform refreshed %s (%d values)".formatted(text(e, "indicatorKey"), e.path("records").asInt()),
                    e.path("success").asBoolean(), at, payload);
            default -> doc(id, topic, topic, userId, null, null, null, topic, false, at, payload);
        };
    }

    private String userName(String userId) {
        if (userId == null) return null;
        return users.findById(UUID.fromString(userId)).map(AppUser::getDisplayName).orElse(null);
    }

    private static String text(JsonNode e, String field) {
        JsonNode n = e.get(field);
        return n == null || n.isNull() ? null : n.asString();
    }

    private static ActivityDocument doc(String id, String type, String topic, String userId, String userName,
            String countryCode, Integer score, String summary, boolean isPublic, Instant at, Map<String, Object> payload) {
        return new ActivityDocument(id, type, topic, userId, userName, countryCode, score, summary, isPublic, at, payload);
    }
}
