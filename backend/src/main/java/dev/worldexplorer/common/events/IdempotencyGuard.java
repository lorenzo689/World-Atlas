package dev.worldexplorer.common.events;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Makes Kafka consumers idempotent. Kafka guarantees "at least once": after a rebalance or a crash
 * the same message can be delivered again. Before applying an event, a consumer calls
 * {@link #firstTime(String, String)} in the <em>same</em> database transaction as its own changes.
 * The insert succeeds only once per (consumer, eventId) thanks to the primary key; on a redelivery
 * it inserts nothing and the consumer skips the event.
 */
@Component
public class IdempotencyGuard {

    private final JdbcClient jdbc;

    public IdempotencyGuard(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean firstTime(String consumer, String eventId) {
        int inserted = jdbc.sql("""
                        insert into processed_event (consumer, event_id) values (:consumer, :eventId)
                        on conflict do nothing
                        """)
                .param("consumer", consumer)
                .param("eventId", eventId)
                .update();
        return inserted == 1;
    }
}
