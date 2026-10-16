package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.UUID;

public record IndicatorIngested(
        String eventId, Instant occurredAt, UUID runId, String indicatorKey, int records, boolean success)
        implements DomainEvent {

    public static IndicatorIngested of(UUID runId, String indicatorKey, int records, boolean success) {
        return new IndicatorIngested(UUID.randomUUID().toString(), Instant.now(), runId, indicatorKey, records, success);
    }

    @Override
    public String topic() {
        return Topics.INDICATOR_INGESTED;
    }

    @Override
    public String key() {
        return indicatorKey;
    }
}
