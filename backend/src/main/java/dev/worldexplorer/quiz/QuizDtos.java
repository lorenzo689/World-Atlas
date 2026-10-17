package dev.worldexplorer.quiz;

import dev.worldexplorer.quiz.engine.Question.PublicQuestion;
import dev.worldexplorer.quiz.engine.QuestionType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class QuizDtos {

    public record StartRequest(
            @NotNull QuizMode mode,
            String region,
            @Min(5) @Max(20) Integer rounds,
            @Size(max = 4) List<QuestionType> types,
            /* slug of the duel, required for mode CHALLENGE */
            String challenge) {}

    public record StartResponse(UUID id, QuizMode mode, int total, boolean ranked, String region) {}

    /** The current question plus its deadline (the server's clock decides what is "too late"). */
    public record QuestionView(PublicQuestion question, Instant servedAt, Instant deadline, int score) {}

    public record AnswerRequest(@Min(0) int index, @Size(max = 8) String answer) {}

    public record AnswerResult(
            boolean correct, boolean late, int points, int score, String correctAnswer, String correctLabel,
            String correctCountry, Double distanceKm, boolean finished, Integer nextIndex) {}

    public record ReviewItem(int index, QuestionType type, String prompt, String target, String answer,
            String correctAnswer, String correctLabel, String correctCountry, boolean correct, int points,
            Double distanceKm, long elapsedMs) {}

    public record Summary(UUID id, QuizMode mode, String region, boolean ranked, int score, int correct, int total,
            long durationMs, Integer weeklyRank, Integer allTimeRank, Integer dailyRank, String challenge,
            List<ReviewItem> review) {}

    public record HistoryItem(UUID id, QuizMode mode, String region, int score, int correct, int total,
            long durationMs, Instant finishedAt) {}

    public record PlayerStats(int games, long totalScore, int bestScore, int answered, int correct,
            double accuracy, int multiplayerGames, int multiplayerWins, List<HistoryItem> recent) {}

    private QuizDtos() {}
}
