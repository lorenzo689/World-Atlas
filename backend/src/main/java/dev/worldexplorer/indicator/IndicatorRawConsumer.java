package dev.worldexplorer.indicator;

import dev.worldexplorer.common.events.Topics;
import java.util.List;
import java.util.Objects;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes raw observations to PostgreSQL in batches (up to 1000 records per poll, 3 consumer threads).
 *
 * <p>Values and unique per-run receipts are written in one transaction. Kafka redelivery cannot
 * inflate the completion count; the monitor reads committed receipts from PostgreSQL.
 */
@Component
public class IndicatorRawConsumer {

    private final IndicatorValueRepository repository;

    public IndicatorRawConsumer(IndicatorValueRepository repository) {
        this.repository = repository;
    }

    @KafkaListener(id = "indicator-writer", topics = Topics.INDICATOR_RAW, containerFactory = "batchFactory",
            groupId = "indicator-writer")
    @Transactional
    public void onBatch(List<IndicatorObservation> batch) {
        // records that could not be deserialised arrive as null (ErrorHandlingDeserializer)
        List<IndicatorObservation> valid = batch.stream().filter(Objects::nonNull).toList();
        if (valid.isEmpty()) return;
        repository.upsert(valid);
        repository.recordReceipts(valid);
    }
}
