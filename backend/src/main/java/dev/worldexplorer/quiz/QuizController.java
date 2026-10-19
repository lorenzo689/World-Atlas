package dev.worldexplorer.quiz;

import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.quiz.QuizDtos.AnswerRequest;
import dev.worldexplorer.quiz.QuizDtos.AnswerResult;
import dev.worldexplorer.quiz.QuizDtos.PlayerStats;
import dev.worldexplorer.quiz.QuizDtos.QuestionView;
import dev.worldexplorer.quiz.QuizDtos.StartRequest;
import dev.worldexplorer.quiz.QuizDtos.StartResponse;
import dev.worldexplorer.quiz.QuizDtos.Summary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Quiz", description = "Single-player geo quiz, daily challenge and leaderboards")
@RestController
public class QuizController {

    private final QuizService quiz;
    private final LeaderboardService leaderboards;
    private final PlayerStatsService stats;
    private final LearningService learning;

    public QuizController(QuizService quiz, LeaderboardService leaderboards, PlayerStatsService stats,
            LearningService learning) {
        this.quiz = quiz;
        this.leaderboards = leaderboards;
        this.stats = stats;
        this.learning = learning;
    }

    @Operation(summary = "Start a quiz (CLASSIC or DAILY)")
    @PostMapping("/api/quiz")
    @ResponseStatus(HttpStatus.CREATED)
    StartResponse start(AuthUser user, @Valid @RequestBody StartRequest body) {
        return quiz.start(user, body);
    }

    @Operation(summary = "The current question; the server starts its clock on the first request")
    @GetMapping("/api/quiz/{id}/question")
    QuestionView question(AuthUser user, @PathVariable UUID id) {
        return quiz.currentQuestion(user, id);
    }

    @PostMapping("/api/quiz/{id}/answer")
    AnswerResult answer(AuthUser user, @PathVariable UUID id, @Valid @RequestBody AnswerRequest body) {
        return quiz.answer(user, id, body);
    }

    @Operation(summary = "Result with a review of every question (after the last answer)")
    @GetMapping("/api/quiz/{id}")
    Summary summary(AuthUser user, @PathVariable UUID id) {
        return quiz.summary(user, id);
    }

    @GetMapping("/api/quiz/{id}/questions/{index}/flag")
    ResponseEntity<byte[]> flag(AuthUser user, @PathVariable UUID id, @PathVariable int index) {
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .cacheControl(CacheControl.noStore())
                .body(quiz.flag(user, id, index));
    }

    @GetMapping("/api/quiz/me/stats")
    PlayerStats myStats(AuthUser user) {
        return stats.stats(user.id());
    }

    @GetMapping("/api/quiz/me/learning")
    LearningService.Overview myLearning(AuthUser user) {
        return learning.overview(user.id());
    }

    @Operation(summary = "Leaderboard: alltime | weekly | daily | multiplayer (wins)")
    @GetMapping("/api/leaderboard")
    LeaderboardService.Board leaderboard(AuthUser user, @RequestParam(defaultValue = "weekly") String period,
            @RequestParam(defaultValue = "20") int limit) {
        return leaderboards.board(LeaderboardService.parse(period), limit, user == null ? null : user.id());
    }
}
