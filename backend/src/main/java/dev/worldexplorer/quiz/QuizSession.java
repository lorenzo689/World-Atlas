package dev.worldexplorer.quiz;

import dev.worldexplorer.quiz.engine.Question;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * State of a running quiz, stored as JSON in Redis under {@code quiz:session:<id>} with a TTL.
 * Redis fits well: the state is short-lived, read/written on every answer, and needs no joins.
 * Only the final result goes to PostgreSQL.
 *
 * <p>Immutable record; every change returns a new instance which is written back.
 */
public record QuizSession(
        UUID id,
        UUID userId,
        String playerName,
        QuizMode mode,
        String region,
        String dailyDate,
        boolean ranked,
        List<Question> questions,
        int current,
        Instant servedAt,
        List<AnswerRecord> answers,
        int score,
        Instant startedAt,
        Instant finishedAt,
        UUID challengeId) {

    public record AnswerRecord(int index, String answer, boolean correct, int points, Double distanceKm,
            long elapsedMs, boolean late) {}

    public boolean finished() {
        return finishedAt != null;
    }

    public Question currentQuestion() {
        return questions.get(current);
    }

    public QuizSession serve(Instant now) {
        return new QuizSession(id, userId, playerName, mode, region, dailyDate, ranked, questions, current, now,
                answers, score, startedAt, finishedAt, challengeId);
    }

    public QuizSession answer(AnswerRecord record, Instant now) {
        List<AnswerRecord> next = new ArrayList<>(answers);
        next.add(record);
        int nextIndex = current + 1;
        Instant done = nextIndex >= questions.size() ? now : null;
        return new QuizSession(id, userId, playerName, mode, region, dailyDate, ranked, questions,
                Math.min(nextIndex, questions.size() - 1), null, next, score + record.points(), startedAt, done,
                challengeId);
    }

    public int correctCount() {
        return (int) answers.stream().filter(AnswerRecord::correct).count();
    }
}
