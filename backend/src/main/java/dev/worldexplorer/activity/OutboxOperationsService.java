package dev.worldexplorer.activity;

import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.OutboxRelay;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Operational view of the transactional outbox. Only exhausted events can be retried manually. */
@Service
public class OutboxOperationsService {

    public record FailedEvent(UUID id, String topic, String key, int attempts, String lastError, Instant createdAt) {}

    public record Status(long pending, long failed, Instant oldestPending, List<FailedEvent> failures) {}

    private final JdbcClient jdbc;

    public OutboxOperationsService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Status status() {
        long pending = jdbc.sql("select count(*) from outbox_event where sent_at is null and attempts < :max")
                .param("max", OutboxRelay.MAX_ATTEMPTS).query(Long.class).single();
        long failed = jdbc.sql("select count(*) from outbox_event where sent_at is null and attempts >= :max")
                .param("max", OutboxRelay.MAX_ATTEMPTS).query(Long.class).single();
        Instant oldest = jdbc.sql("select min(created_at) from outbox_event where sent_at is null and attempts < :max")
                .param("max", OutboxRelay.MAX_ATTEMPTS).query(Timestamp.class).optional()
                .map(Timestamp::toInstant).orElse(null);
        List<FailedEvent> failures = jdbc.sql("""
                        select id, topic, msg_key, attempts, last_error, created_at from outbox_event
                        where sent_at is null and attempts >= :max
                        order by created_at limit 25
                        """)
                .param("max", OutboxRelay.MAX_ATTEMPTS)
                .query((rs, row) -> new FailedEvent(rs.getObject("id", UUID.class), rs.getString("topic"),
                        rs.getString("msg_key"), rs.getInt("attempts"), rs.getString("last_error"),
                        rs.getTimestamp("created_at").toInstant()))
                .list();
        return new Status(pending, failed, oldest, failures);
    }

    /** The conditional update prevents a sent event or an event still being retried from being reset. */
    public void retry(UUID id) {
        int updated = jdbc.sql("""
                        update outbox_event set attempts = 0, last_error = null, next_attempt_at = now()
                        where id = :id and sent_at is null and attempts >= :max
                        """)
                .param("id", id).param("max", OutboxRelay.MAX_ATTEMPTS).update();
        if (updated == 0) throw ApiException.conflict("outbox_not_failed", "This event is not an exhausted outbox event.");
    }
}
