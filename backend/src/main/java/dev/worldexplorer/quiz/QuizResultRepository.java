package dev.worldexplorer.quiz;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuizResultRepository extends JpaRepository<QuizResult, UUID> {

    List<QuizResult> findByUserIdOrderByFinishedAtDesc(UUID userId, Pageable page);
}
