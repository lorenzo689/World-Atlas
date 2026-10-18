package dev.worldexplorer.indicator;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.common.redis.RedisLock;
import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.indicator.IndicatorDtos.IngestionRunDto;
import dev.worldexplorer.indicator.IngestionRun.Status;
import dev.worldexplorer.indicator.IngestionRun.Trigger;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Write side of the data platform: pulls an indicator from the World Bank and pushes every observation
 * into Kafka. The pipeline:
 *
 * <pre>
 *  World Bank API ──fetch──▶ IngestionService ──produce──▶ [indicator.raw] (6 partitions, key = country)
 *                                                               │
 *                               IndicatorRawConsumer (batch, 3 threads) ──upsert──▶ PostgreSQL
 *                                                               │ counts stored rows in Redis
 *                               IngestionMonitor ──all stored?──▶ COMPLETED + [indicator.ingested]
 *                                                               │
 *                                         cache eviction, activity log, …
 * </pre>
 *
 * Decoupling fetch and write through Kafka means the writer can be scaled (more partitions/consumers),
 * survives restarts (offsets) and failed rows end up in a dead-letter topic instead of breaking the run.
 */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final IndicatorSource source;
    private final KafkaTemplate<Object, Object> kafka;
    private final IngestionRunRepository runs;
    private final IngestionRunTransitions transitions;
    private final CountryCatalog countries;
    private final RedisLock lock;
    private final TransactionTemplate tx;
    private final AppProperties.Ingestion config;
    private final Counter published;
    /** Background work runs on virtual threads: cheap, and blocking HTTP calls are fine there. */
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public IngestionService(IndicatorSource source, KafkaTemplate<Object, Object> kafka, IngestionRunRepository runs,
            IngestionRunTransitions transitions, CountryCatalog countries, RedisLock lock, TransactionTemplate tx,
            AppProperties props, MeterRegistry meters) {
        this.source = source;
        this.kafka = kafka;
        this.runs = runs;
        this.transitions = transitions;
        this.countries = countries;
        this.lock = lock;
        this.tx = tx;
        this.config = props.ingestion();
        this.published = Counter.builder("ingestion.observations.published").register(meters);
    }

    /** Starts one indicator in the background and returns the new run immediately. */
    public IngestionRunDto trigger(IndicatorDefinition def, Trigger trigger) {
        IngestionRun run = createRun(def, trigger);
        executor.execute(() -> execute(run.getId(), def));
        return IngestionRunDto.of(run);
    }

    /** Ingests all indicators one after another (polite to the World Bank API). */
    public void triggerAll(Trigger trigger) {
        executor.execute(() -> {
            for (IndicatorDefinition def : IndicatorDefinition.values()) {
                try {
                    IngestionRun run = createRun(def, trigger);
                    execute(run.getId(), def);
                } catch (ApiException e) {
                    log.info("Skipping {}: {}", def.key(), e.getMessage());
                }
            }
        });
    }

    public List<IngestionRunDto> recentRuns(int limit) {
        return runs.findAllByOrderByStartedAtDesc(PageRequest.of(0, Math.min(limit, 200)))
                .stream().map(IngestionRunDto::of).toList();
    }

    private IngestionRun createRun(IndicatorDefinition def, Trigger trigger) {
        boolean running = runs.existsByIndicatorKeyAndStatusInAndStartedAtAfter(def.key(),
                List.of(Status.FETCHING, Status.PUBLISHED), Instant.now().minus(config.runTimeout()));
        if (running) throw ApiException.conflict("ingestion_running", def.key() + " is already being ingested.");
        return tx.execute(s -> runs.save(new IngestionRun(def.key(), trigger)));
    }

    /** Fetch + publish, guarded by a Redis lock so two instances never fetch the same indicator at once. */
    void execute(java.util.UUID runId, IndicatorDefinition def) {
        var token = lock.tryAcquire("ingestion:" + def.key(), Duration.ofMinutes(5));
        if (token.isEmpty()) {
            transitions.failed(runId, def.key(), Status.FETCHING,
                    "Another instance is already ingesting " + def.key());
            return;
        }
        try {
            List<IndicatorSource.Row> rows = source.fetchAll(def.worldBankId(), config.fromYear());
            List<IndicatorSource.Row> known = rows.stream().filter(r -> countries.exists(r.countryCode())).toList();
            for (IndicatorSource.Row r : known) {
                kafka.send(Topics.INDICATOR_RAW, r.countryCode(),
                        new IndicatorObservation(runId, def.key(), r.countryCode(), r.year(), r.value()));
            }
            kafka.flush();
            published.increment(known.size());
            log.info("Ingestion {} ({}): published {} of {} rows", def.key(), runId, known.size(), rows.size());
            if (known.isEmpty()) transitions.completedEmpty(runId, def.key());
            else transitions.published(runId, known.size());
        } catch (Exception e) {
            log.warn("Ingestion {} failed: {}", def.key(), e.toString());
            transitions.failed(runId, def.key(), Status.FETCHING, e.getMessage());
        } finally {
            lock.release("ingestion:" + def.key(), token.get());
        }
    }

    public static List<IndicatorDefinition> all() {
        return Arrays.asList(IndicatorDefinition.values());
    }
}
