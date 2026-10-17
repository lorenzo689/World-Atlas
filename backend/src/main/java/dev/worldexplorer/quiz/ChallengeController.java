package dev.worldexplorer.quiz;

import dev.worldexplorer.common.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Quiz duels", description = "Share a link, everybody plays the same questions")
@RestController
public class ChallengeController {

    public record CreateChallenge(String region, @Min(5) @Max(20) Integer rounds) {}

    private final ChallengeService challenges;

    public ChallengeController(ChallengeService challenges) {
        this.challenges = challenges;
    }

    @Operation(summary = "Create a duel; play it with POST /api/quiz {mode: CHALLENGE, challenge: slug}")
    @PostMapping("/api/challenges")
    @ResponseStatus(HttpStatus.CREATED)
    ChallengeService.ChallengeView create(AuthUser user, @Valid @RequestBody CreateChallenge body) {
        return challenges.create(user, body.region(), body.rounds());
    }

    @Operation(summary = "Duel details and the ranking of everybody who played it")
    @GetMapping("/api/challenges/{slug}")
    ChallengeService.ChallengeView get(AuthUser user, @PathVariable String slug) {
        return challenges.get(slug, user == null ? null : user.id());
    }
}
