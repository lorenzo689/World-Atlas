package dev.worldexplorer.quiz;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuizChallengeRepository extends JpaRepository<QuizChallenge, UUID> {

    Optional<QuizChallenge> findBySlug(String slug);

    boolean existsBySlug(String slug);
}
