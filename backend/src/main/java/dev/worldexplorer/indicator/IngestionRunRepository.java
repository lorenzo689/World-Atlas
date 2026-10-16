package dev.worldexplorer.indicator;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface IngestionRunRepository extends JpaRepository<IngestionRun, UUID> {

    List<IngestionRun> findByStatus(IngestionRun.Status status);

    List<IngestionRun> findAllByOrderByStartedAtDesc(Pageable page);

    boolean existsByIndicatorKeyAndStatusInAndStartedAtAfter(
            String indicatorKey, Collection<IngestionRun.Status> statuses, Instant after);

    /**
     * Conditional update = optimistic state transition. Returns 1 only for the caller that actually moved
     * the run from PUBLISHED to COMPLETED, so several instances running the monitor cannot both finish it.
     */
    @Modifying
    @Query("""
            update IngestionRun r set r.status = 'COMPLETED', r.stored = :stored, r.finishedAt = :now
            where r.id = :id and r.status = 'PUBLISHED'
            """)
    int markCompleted(UUID id, int stored, Instant now);
}
