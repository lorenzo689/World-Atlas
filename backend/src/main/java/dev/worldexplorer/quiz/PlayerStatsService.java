package dev.worldexplorer.quiz;

import dev.worldexplorer.common.events.IdempotencyGuard;
import dev.worldexplorer.common.events.MultiplayerFinished;
import dev.worldexplorer.common.events.QuizCompleted;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.quiz.QuizDtos.HistoryItem;
import dev.worldexplorer.quiz.QuizDtos.PlayerStats;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Player statistics as a projection of Kafka events ({@code quiz.completed}, {@code multiplayer.finished}).
 *
 * <p>The quiz service does not update statistics itself – it only announces "a quiz was completed".
 * This consumer builds the aggregate. It is idempotent: the {@link IdempotencyGuard} insert and the
 * statistics upsert happen in the same transaction, so a redelivered event changes nothing.
 */
@Service
public class PlayerStatsService {

    private final JdbcClient jdbc;
    private final IdempotencyGuard guard;
    private final QuizResultRepository results;
    private final LeaderboardService leaderboards;

    public PlayerStatsService(JdbcClient jdbc, IdempotencyGuard guard, QuizResultRepository results,
            LeaderboardService leaderboards) {
        this.jdbc = jdbc;
        this.guard = guard;
        this.results = results;
        this.leaderboards = leaderboards;
    }

    @Transactional
    @KafkaListener(id = "player-stats-quiz", topics = Topics.QUIZ_COMPLETED, groupId = "player-stats")
    public void onQuiz(QuizCompleted e) {
        if (e.userId() == null || !guard.firstTime("player-stats", e.eventId())) return;
        jdbc.sql("""
                        insert into player_stats (user_id, games, total_score, best_score, answered, correct, updated_at)
                        values (:u, 1, :score, :score, :total, :correct, now())
                        on conflict (user_id) do update set
                            games = player_stats.games + 1,
                            total_score = player_stats.total_score + excluded.total_score,
                            best_score = greatest(player_stats.best_score, excluded.best_score),
                            answered = player_stats.answered + excluded.answered,
                            correct = player_stats.correct + excluded.correct,
                            updated_at = now()
                        """)
                .param("u", e.userId()).param("score", e.score()).param("total", e.total()).param("correct", e.correct())
                .update();
    }

    @Transactional
    @KafkaListener(id = "player-stats-multiplayer", topics = Topics.MULTIPLAYER_FINISHED, groupId = "player-stats")
    public void onMultiplayer(MultiplayerFinished e) {
        if (!guard.firstTime("player-stats", e.eventId())) return;
        for (MultiplayerFinished.Placement p : e.placements()) {
            int win = p.placement() == 1 ? 1 : 0;
            jdbc.sql("""
                            insert into player_stats (user_id, multiplayer_games, multiplayer_wins, answered, correct, updated_at)
                            values (:u, 1, :win, :answered, :correct, now())
                            on conflict (user_id) do update set
                                multiplayer_games = player_stats.multiplayer_games + 1,
                                multiplayer_wins = player_stats.multiplayer_wins + excluded.multiplayer_wins,
                                answered = player_stats.answered + excluded.answered,
                                correct = player_stats.correct + excluded.correct,
                                updated_at = now()
                            """)
                    .param("u", p.userId()).param("win", win).param("answered", p.answered()).param("correct", p.correct())
                    .update();
            if (win == 1) leaderboards.recordWin(p.userId(), p.name());
        }
    }

    @Transactional(readOnly = true)
    public PlayerStats stats(UUID userId) {
        List<HistoryItem> recent = results.findByUserIdOrderByFinishedAtDesc(userId, PageRequest.of(0, 20)).stream()
                .map(r -> new HistoryItem(r.getId(), r.getMode(), r.getRegion(), r.getScore(), r.getCorrect(), r.getTotal(),
                        r.getDurationMs(), r.getFinishedAt()))
                .toList();
        return jdbc.sql("""
                        select games, total_score, best_score, answered, correct, multiplayer_games, multiplayer_wins
                        from player_stats where user_id = :u
                        """)
                .param("u", userId)
                .query((rs, i) -> {
                    int answered = rs.getInt("answered");
                    int correct = rs.getInt("correct");
                    return new PlayerStats(rs.getInt("games"), rs.getLong("total_score"), rs.getInt("best_score"),
                            answered, correct, answered == 0 ? 0 : Math.round(1000.0 * correct / answered) / 10.0,
                            rs.getInt("multiplayer_games"), rs.getInt("multiplayer_wins"), recent);
                })
                .optional()
                .orElse(new PlayerStats(0, 0, 0, 0, 0, 0, 0, 0, recent));
    }
}
