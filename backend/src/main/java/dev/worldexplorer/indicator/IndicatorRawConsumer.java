package dev.worldexplorer.indicator;

import dev.worldexplorer.common.events.Topics;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Writes raw observations to PostgreSQL in batches (up to 1000 records per poll, 3 consumer threads).
 *
 * <p>The upsert is idempotent, so a redelivered batch does no harm. After writing, the number of
 * stored rows is added to a Redis counter per run ({@code ingestion:<runId>:stored}); the
 * {@link IngestionMonitor} compares it with the number of published rows to detect completion.
 */
@Component
public class IndicatorRawConsumer {

    private final IndicatorValueRepository repository;
    private final StringRedisTemplate redis;

    public IndicatorRawConsumer(IndicatorValueRepository repository, StringRedisTemplate redis) {
        this.repository = repository;
        this.redis = redis;
    }

    @KafkaListener(id = "indicator-writer", topics = Topics.INDICATOR_RAW, containerFactory = "batchFactory",
            groupId = "indicator-writer")
    public void onBatch(List<IndicatorObservation> batch) {
        // records that could not be deserialised arrive as null (ErrorHandlingDeserializer)
        List<IndicatorObservation> valid = batch.stream().filter(Objects::nonNull).toList();
        if (valid.isEmpty()) return;
        repository.upsert(valid);
        Map<UUID, Long> perRun = valid.stream()
                .collect(Collectors.groupingBy(IndicatorObservation::runId, Collectors.counting()));
        perRun.forEach((runId, n) -> redis.opsForValue().increment(IngestionMonitor.storedKey(runId), n));
    }
}
