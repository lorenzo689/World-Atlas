package dev.worldexplorer.indicator;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Bookkeeping for one ingestion of one indicator.
 *
 * <pre>
 * FETCHING ──(all rows sent to Kafka)──▶ PUBLISHED ──(consumer stored them all)──▶ COMPLETED
 *     └──────────────(error / timeout)──────────┴──────────────────────────────▶ FAILED
 * </pre>
 */
@Entity
@Table(name = "ingestion_run")
public class IngestionRun {

    public enum Status { FETCHING, PUBLISHED, COMPLETED, FAILED }

    public enum Trigger { MANUAL, SCHEDULED, BOOTSTRAP }

    @Id
    private UUID id;

    @Column(name = "indicator_key", nullable = false)
    private String indicatorKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Trigger trigger;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private int fetched;
    private int stored;
    private String error;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected IngestionRun() {}

    public IngestionRun(String indicatorKey, Trigger trigger) {
        this.id = UUID.randomUUID();
        this.indicatorKey = indicatorKey;
        this.trigger = trigger;
        this.status = Status.FETCHING;
        this.startedAt = Instant.now();
    }

    public void published(int fetched) {
        this.fetched = fetched;
        this.status = Status.PUBLISHED;
    }

    public void completed(int stored) {
        this.stored = stored;
        this.status = Status.COMPLETED;
        this.finishedAt = Instant.now();
    }

    public void failed(String error) {
        this.error = error == null ? "unknown error" : error.substring(0, Math.min(error.length(), 2000));
        this.status = Status.FAILED;
        this.finishedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getIndicatorKey() { return indicatorKey; }
    public Trigger getTrigger() { return trigger; }
    public Status getStatus() { return status; }
    public int getFetched() { return fetched; }
    public int getStored() { return stored; }
    public String getError() { return error; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
}
