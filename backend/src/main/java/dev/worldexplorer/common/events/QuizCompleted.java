package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record QuizCompleted(
        String eventId,
        Instant occurredAt,
        UUID quizId,
        UUID userId,
        String playerName,
        String mode,
        String region,
        int score,
        int correct,
        int total,
        long durationMs,
        List<Answer> answers)
        implements DomainEvent {

    /** Per-question outcome, used for statistics by question type and country. */
    public record Answer(String type, String countryCode, boolean correct, int points) {}

    @Override
    public String topic() {
        return Topics.QUIZ_COMPLETED;
    }

    @Override
    public String key() {
        return userId == null ? quizId.toString() : userId.toString();
    }
}
