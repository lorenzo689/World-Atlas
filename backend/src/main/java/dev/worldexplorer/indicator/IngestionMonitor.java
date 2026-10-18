package dev.worldexplorer.indicator;

import dev.worldexplorer.common.config.AppProperties;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Detects when the asynchronous part of a run is done: every few seconds it compares, for each
 * PUBLISHED run, the distinct committed receipts with the rows published.
 * Runs stuck for longer than {@code app.ingestion.run-timeout} are marked FAILED.
 */
@Component
public class IngestionMonitor {

    private static final Logger log = LoggerFactory.getLogger(IngestionMonitor.class);

    private final IngestionRunRepository runs;
    private final IndicatorValueRepository values;
    private final IngestionRunTransitions transitions;
    private final Duration timeout;

    public IngestionMonitor(IngestionRunRepository runs, IndicatorValueRepository values,
            IngestionRunTransitions transitions, AppProperties props) {
        this.runs = runs;
        this.values = values;
        this.transitions = transitions;
        this.timeout = props.ingestion().runTimeout();
    }

    @Scheduled(fixedDelay = 3000, initialDelay = 5000)
    public void check() {
        for (IngestionRun run : runs.findByStatus(IngestionRun.Status.PUBLISHED)) {
            int stored = values.countStored(run.getId());
            if (stored >= run.getFetched()) {
                if (transitions.completedStored(run.getId(), run.getIndicatorKey(), stored)) {
                    log.info("Ingestion {} completed: {} rows stored", run.getIndicatorKey(), stored);
                }
            } else if (run.getStartedAt().isBefore(Instant.now().minus(timeout))) {
                failStale(run, "Timed out: stored " + stored + " of " + run.getFetched());
            }
        }
        // runs that died while fetching (e.g. the instance crashed)
        for (IngestionRun run : runs.findByStatus(IngestionRun.Status.FETCHING)) {
            if (run.getStartedAt().isBefore(Instant.now().minus(timeout))) failStale(run, "Timed out while fetching");
        }
    }

    private void failStale(IngestionRun run, String reason) {
        if (transitions.failed(run.getId(), run.getIndicatorKey(), run.getStatus(), reason)) {
            log.warn("Ingestion {} failed: {}", run.getIndicatorKey(), reason);
        }
    }
}
