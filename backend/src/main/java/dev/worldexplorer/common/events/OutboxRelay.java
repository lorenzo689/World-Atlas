package dev.worldexplorer.common.events;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Sends the rows of {@code outbox_event} to Kafka.
 *
 * <p>Every 300 ms one batch is claimed with {@code SELECT … FOR UPDATE SKIP LOCKED}: several backend
 * instances can run the relay at the same time, each one locks different rows and none waits for
 * the others. A row is marked sent only after Kafka acknowledged it ({@code send().get()}); if the
 * send fails, the row stays unsent and is retried in the next round. Rows that fail 20 times are
 * left for an operator (see {@code last_error}). Sent rows are deleted after 3 days.
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
    private static final int BATCH = 200;
    public static final int MAX_ATTEMPTS = 20;

    record Row(UUID id, String topic, String key, String type, String payload) {}

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final KafkaTemplate<Object, Object> kafka;
    private final JsonMapper json;

    public OutboxRelay(JdbcClient jdbc, TransactionTemplate tx, KafkaTemplate<Object, Object> kafka, JsonMapper json,
            MeterRegistry meters) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.kafka = kafka;
        this.json = json;
        Gauge.builder("outbox.pending", this, OutboxRelay::pending)
                .description("Domain events eligible for delivery to Kafka")
                .register(meters);
        Gauge.builder("outbox.failed", this, OutboxRelay::failed)
                .description("Domain events that exhausted delivery attempts and need operator action")
                .register(meters);
        Gauge.builder("outbox.oldest.age.seconds", this, OutboxRelay::oldestAgeSeconds)
                .description("Age of the oldest unsent retryable event in seconds")
                .register(meters);
    }

    @Scheduled(fixedDelay = 300, initialDelay = 2000)
    public void relay() {
        // loop while full batches come back, so a burst is drained quickly
        Integer sent;
        do {
            sent = tx.execute(s -> relayBatch());
        } while (sent != null && sent == BATCH);
    }

    int relayBatch() {
        List<Row> rows = jdbc.sql("""
                        select id, topic, msg_key, type, payload from outbox_event
                        where sent_at is null and attempts < :max and next_attempt_at <= now()
                        order by created_at
                        limit :batch
                        for update skip locked
                        """)
                .param("max", MAX_ATTEMPTS).param("batch", BATCH)
                .query((rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("topic"),
                        rs.getString("msg_key"), rs.getString("type"), rs.getString("payload")))
                .list();
        int sent = 0;
        for (Row row : rows) {
            try {
                Object event = json.readValue(row.payload(), Class.forName(row.type()));
                kafka.send(row.topic(), row.key(), event).get(10, TimeUnit.SECONDS);
                jdbc.sql("update outbox_event set sent_at = now(), attempts = attempts + 1 where id = :id")
                        .param("id", row.id()).update();
                sent++;
            } catch (Exception e) {
                if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                log.warn("Outbox event {} ({}) not sent: {}", row.id(), row.topic(), e.getMessage());
                jdbc.sql("""
                        update outbox_event
                        set attempts = attempts + 1, last_error = :err,
                            next_attempt_at = now() + (least(60, power(2, least(attempts, 6))) * interval '1 second')
                        where id = :id
                        """).param("id", row.id()).param("err", String.valueOf(e.getMessage())).update();
                break; // keep the order: stop at the first failure, retry later
            }
        }
        return sent;
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    public void cleanUp() {
        int deleted = jdbc.sql("delete from outbox_event where sent_at < now() - interval '3 days'").update();
        if (deleted > 0) log.info("Deleted {} sent outbox events", deleted);
    }

    double pending() {
        try {
            return jdbc.sql("select count(*) from outbox_event where sent_at is null and attempts < :max")
                    .param("max", MAX_ATTEMPTS).query(Long.class).single();
        } catch (Exception e) {
            return Double.NaN;
        }
    }

    double failed() {
        try {
            return jdbc.sql("select count(*) from outbox_event where sent_at is null and attempts >= :max")
                    .param("max", MAX_ATTEMPTS).query(Long.class).single();
        } catch (Exception e) {
            return Double.NaN;
        }
    }

    double oldestAgeSeconds() {
        try {
            return jdbc.sql("""
                    select coalesce(extract(epoch from now() - min(created_at)), 0)
                    from outbox_event where sent_at is null and attempts < :max
                    """).param("max", MAX_ATTEMPTS).query(Double.class).single();
        } catch (Exception e) {
            return Double.NaN;
        }
    }
}
