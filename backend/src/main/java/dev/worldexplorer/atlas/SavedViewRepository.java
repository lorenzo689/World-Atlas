package dev.worldexplorer.atlas;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedViewRepository extends JpaRepository<SavedView, UUID> {

    List<SavedView> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedView> findBySlug(String slug);

    boolean existsBySlug(String slug);
}
