package dev.worldexplorer.quiz;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A finished quiz (history and statistics). */
@Entity
@Table(name = "quiz_result")
public class QuizResult {

    @Id
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "player_name", nullable = false)
    private String playerName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private QuizMode mode;

    private String region;
    private int score;
    private int correct;
    private int total;

    @Column(name = "duration_ms")
    private long durationMs;

    @Column(name = "finished_at", nullable = false)
    private Instant finishedAt;

    protected QuizResult() {}

    public QuizResult(UUID id, UUID userId, String playerName, QuizMode mode, String region, int score, int correct,
            int total, long durationMs, Instant finishedAt) {
        this.id = id;
        this.userId = userId;
        this.playerName = playerName;
        this.mode = mode;
        this.region = region;
        this.score = score;
        this.correct = correct;
        this.total = total;
        this.durationMs = durationMs;
        this.finishedAt = finishedAt;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getPlayerName() { return playerName; }
    public QuizMode getMode() { return mode; }
    public String getRegion() { return region; }
    public int getScore() { return score; }
    public int getCorrect() { return correct; }
    public int getTotal() { return total; }
    public long getDurationMs() { return durationMs; }
    public Instant getFinishedAt() { return finishedAt; }
}
