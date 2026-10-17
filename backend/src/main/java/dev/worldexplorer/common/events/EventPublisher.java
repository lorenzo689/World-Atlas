package dev.worldexplorer.common.events;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Publishes domain events with the <b>transactional outbox</b> pattern.
 *
 * <p>{@link #publish} does not talk to Kafka. It inserts the event into the {@code outbox_event} table –
 * inside the caller's database transaction. So the business change and the event are committed
 * together or not at all:
 * <ul>
 *   <li>transaction rolls back → no event (consumers never hear about data that does not exist)
 *   <li>process crashes after the commit → the event is still in the table and will be sent
 * </ul>
 * The {@link OutboxRelay} sends unsent rows to Kafka in the background. Delivery is therefore
 * "at least once" – which is why all consumers are idempotent.
 *
 * <p>Outside a transaction the insert simply auto-commits.
 */
@Component
public class EventPublisher {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    public EventPublisher(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void publish(DomainEvent event) {
        jdbc.sql("""
                        insert into outbox_event (id, topic, msg_key, type, payload)
                        values (:id, :topic, :key, :type, :payload)
                        """)
                .param("id", UUID.fromString(event.eventId()))
                .param("topic", event.topic())
                .param("key", event.key())
                .param("type", event.getClass().getName())
                .param("payload", json.writeValueAsString(event))
                .update();
    }
}
