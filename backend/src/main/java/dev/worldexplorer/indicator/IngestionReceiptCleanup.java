package dev.worldexplorer.indicator;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Bounds receipt storage while keeping recent runs available for diagnostics and replay. */
@Component
public class IngestionReceiptCleanup {

    private final JdbcClient jdbc;

    public IngestionReceiptCleanup(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 3_600_000)
    public void prune() {
        for (int i = 0; i < 10; i++) {
            int removed = jdbc.sql("""
                    delete from ingestion_receipt where ctid in (
                        select receipt.ctid from ingestion_receipt receipt
                        join ingestion_run run on run.id = receipt.run_id
                        where run.status in ('COMPLETED', 'FAILED')
                          and run.finished_at < now() - interval '7 days'
                        limit 10000
                    )
                    """).update();
            if (removed < 10_000) return;
        }
    }
}
