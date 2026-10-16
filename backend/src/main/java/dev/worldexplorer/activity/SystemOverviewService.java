package dev.worldexplorer.activity;

import dev.worldexplorer.auth.AppUserRepository;
import dev.worldexplorer.indicator.IndicatorValueRepository;
import dev.worldexplorer.search.CountryDocument;
import dev.worldexplorer.search.NoteDocument;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Service;

/**
 * An operations view across all four data stores – handy to see the architecture "live":
 * row counts in PostgreSQL, documents in Elasticsearch, keys in Redis and consumer lag in Kafka.
 */
@Service
public class SystemOverviewService {

    /** Kafka consumer groups of this application (see the @KafkaListener groupIds). */
    private static final List<String> GROUPS =
            List.of("indicator-writer", "indicator-cache", "note-indexer", "player-stats", "activity-indexer");

    public record ConsumerLag(String group, String topic, long lag) {}

    public record Overview(Map<String, Long> postgres, Map<String, Long> elasticsearch, Map<String, Object> redis,
            List<ConsumerLag> kafkaLag, String kafkaError) {}

    private final JdbcClient jdbc;
    private final AppUserRepository users;
    private final IndicatorValueRepository indicators;
    private final ElasticsearchOperations es;
    private final StringRedisTemplate redis;
    private final KafkaAdmin kafkaAdmin;
    private final ActivityService activity;

    public SystemOverviewService(JdbcClient jdbc, AppUserRepository users, IndicatorValueRepository indicators,
            ElasticsearchOperations es, StringRedisTemplate redis, KafkaAdmin kafkaAdmin, ActivityService activity) {
        this.jdbc = jdbc;
        this.users = users;
        this.indicators = indicators;
        this.es = es;
        this.redis = redis;
        this.kafkaAdmin = kafkaAdmin;
        this.activity = activity;
    }

    public Overview overview() {
        Map<String, Long> pg = new LinkedHashMap<>();
        pg.put("users", users.countByGuestFalse());
        pg.put("guests", users.count() - users.countByGuestFalse());
        pg.put("indicatorValues", indicators.count());
        pg.put("quizResults", count("quiz_result"));
        pg.put("multiplayerGames", count("multiplayer_game"));
        pg.put("notes", count("note"));
        pg.put("favorites", count("favorite"));

        Map<String, Long> search = new LinkedHashMap<>();
        search.put("countries", safeCount(CountryDocument.class));
        search.put("notes", safeCount(NoteDocument.class));
        long events;
        try {
            events = activity.count();
        } catch (Exception e) {
            events = -1;
        }
        search.put("activity", events);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("keys", redis.execute((RedisCallback<Long>) (RedisConnection c) -> c.serverCommands().dbSize()));
        r.put("openRooms", redis.opsForSet().size("rooms:open"));
        r.put("matchmakingQueue", redis.opsForZSet().size("mm:queue"));
        r.put("leaderboardAllTime", redis.opsForZSet().size("lb:alltime"));

        List<ConsumerLag> lag = new ArrayList<>();
        String kafkaError = null;
        try {
            lag = kafkaLag();
        } catch (Exception e) {
            kafkaError = e.getMessage();
        }
        return new Overview(pg, search, r, lag, kafkaError);
    }

    /** lag = latest offset in the partition − offset the group has committed. */
    private List<ConsumerLag> kafkaLag() throws Exception {
        Properties config = new Properties();
        config.putAll(kafkaAdmin.getConfigurationProperties());
        try (Admin admin = Admin.create(config)) {
            List<ConsumerLag> out = new ArrayList<>();
            for (String group : GROUPS) {
                Map<TopicPartition, OffsetAndMetadata> committed = admin.listConsumerGroupOffsets(group)
                        .partitionsToOffsetAndMetadata().get(5, TimeUnit.SECONDS);
                if (committed.isEmpty()) continue;
                Map<TopicPartition, OffsetSpec> request = new HashMap<>();
                committed.keySet().forEach(tp -> request.put(tp, OffsetSpec.latest()));
                Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest =
                        admin.listOffsets(request).all().get(5, TimeUnit.SECONDS);
                Map<String, Long> perTopic = new LinkedHashMap<>();
                committed.forEach((tp, om) -> {
                    long end = latest.get(tp).offset();
                    long done = om == null ? 0 : om.offset();
                    perTopic.merge(tp.topic(), Math.max(0, end - done), Long::sum);
                });
                perTopic.forEach((topic, l) -> out.add(new ConsumerLag(group, topic, l)));
            }
            return out;
        }
    }

    private long count(String table) {
        return jdbc.sql("select count(*) from " + table).query(Long.class).single();
    }

    private long safeCount(Class<?> type) {
        try {
            return es.count(NativeQuery.builder().withQuery(q -> q.matchAll(m -> m)).build(), type);
        } catch (Exception e) {
            return -1;
        }
    }
}
