package dev.worldexplorer.indicator;

import static org.assertj.core.api.Assertions.assertThat;

import dev.worldexplorer.support.IntegrationTest;
import java.util.UUID;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

class IngestionRunTransitionsIT extends IntegrationTest {

    @Autowired IngestionRunRepository runs;
    @Autowired IngestionRunTransitions transitions;
    @Autowired JdbcClient jdbc;
    @Autowired IndicatorRawConsumer consumer;
    @Autowired IndicatorValueRepository values;

    @Test
    void onlyOneTerminalTransitionWinsAndWritesOneOutboxEvent() {
        IngestionRun run = runs.saveAndFlush(new IngestionRun("test-" + UUID.randomUUID().toString().substring(0, 8),
                IngestionRun.Trigger.MANUAL));
        UUID id = run.getId();

        assertThat(transitions.published(id, 2)).isTrue();
        assertThat(transitions.failed(id, run.getIndicatorKey(), IngestionRun.Status.FETCHING, "stale timeout"))
                .isFalse();
        assertThat(transitions.completedStored(id, run.getIndicatorKey(), 2)).isTrue();
        assertThat(transitions.completedStored(id, run.getIndicatorKey(), 2)).isFalse();
        assertThat(transitions.failed(id, run.getIndicatorKey(), IngestionRun.Status.PUBLISHED, "late timeout"))
                .isFalse();

        IngestionRun result = runs.findById(id).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(IngestionRun.Status.COMPLETED);
        assertThat(result.getStored()).isEqualTo(2);
        assertThat(eventCount(id)).isEqualTo(1);
    }

    @Test
    void emptyRunCompletesAndEmitsSuccessEvent() {
        IngestionRun run = runs.saveAndFlush(new IngestionRun("test-" + UUID.randomUUID().toString().substring(0, 8),
                IngestionRun.Trigger.MANUAL));
        assertThat(transitions.completedEmpty(run.getId(), run.getIndicatorKey())).isTrue();
        assertThat(runs.findById(run.getId()).orElseThrow().getStatus())
                .isEqualTo(IngestionRun.Status.COMPLETED);
        assertThat(eventCount(run.getId())).isEqualTo(1);
    }

    @Test
    void redeliveredKafkaBatchCountsEachObservationOnce() {
        IngestionRun run = runs.saveAndFlush(new IngestionRun("test-" + UUID.randomUUID().toString().substring(0, 8),
                IngestionRun.Trigger.MANUAL));
        var observation = new IndicatorObservation(run.getId(), run.getIndicatorKey(), "DEU", 2023, 42);
        consumer.onBatch(List.of(observation));
        consumer.onBatch(List.of(observation));

        assertThat(values.countStored(run.getId())).isEqualTo(1);
        assertThat(transitions.published(run.getId(), 1)).isTrue();
        assertThat(transitions.completedStored(run.getId(), run.getIndicatorKey(), values.countStored(run.getId())))
                .isTrue();
        assertThat(runs.findById(run.getId()).orElseThrow().getStored()).isEqualTo(1);
        assertThat(eventCount(run.getId())).isEqualTo(1);
    }

    private long eventCount(UUID runId) {
        return jdbc.sql("select count(*) from outbox_event where payload like :runId")
                .param("runId", "%" + runId + "%")
                .query(Long.class).single();
    }
}
