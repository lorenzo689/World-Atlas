package dev.worldexplorer.indicator;

import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.IndicatorIngested;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Single owner of the ingestion state machine and its transactional outbox events. */
@Component
public class IngestionRunTransitions {

    private final IngestionRunRepository runs;
    private final EventPublisher events;
    private final TransactionTemplate tx;

    public IngestionRunTransitions(IngestionRunRepository runs, EventPublisher events, TransactionTemplate tx) {
        this.runs = runs;
        this.events = events;
        this.tx = tx;
    }

    public boolean published(UUID runId, int fetched) {
        return Boolean.TRUE.equals(tx.execute(s -> runs.markPublished(runId, fetched) == 1));
    }

    public boolean completedEmpty(UUID runId, String indicatorKey) {
        return Boolean.TRUE.equals(tx.execute(s -> {
            if (runs.markCompletedEmpty(runId, Instant.now()) != 1) return false;
            events.publish(IndicatorIngested.of(runId, indicatorKey, 0, true));
            return true;
        }));
    }

    public boolean completedStored(UUID runId, String indicatorKey, int stored) {
        return Boolean.TRUE.equals(tx.execute(s -> {
            if (runs.markCompleted(runId, stored, Instant.now()) != 1) return false;
            events.publish(IndicatorIngested.of(runId, indicatorKey, stored, true));
            return true;
        }));
    }

    public boolean failed(UUID runId, String indicatorKey, IngestionRun.Status expected, String reason) {
        String error = reason == null ? "unknown error" : reason.substring(0, Math.min(reason.length(), 2000));
        return Boolean.TRUE.equals(tx.execute(s -> {
            if (runs.markFailed(runId, expected, error, Instant.now()) != 1) return false;
            events.publish(IndicatorIngested.of(runId, indicatorKey, 0, false));
            return true;
        }));
    }
}
