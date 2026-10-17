package dev.worldexplorer.achievement;

import dev.worldexplorer.common.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Achievements")
@RestController
public class AchievementController {

    private final AchievementService achievements;

    public AchievementController(AchievementService achievements) {
        this.achievements = achievements;
    }

    @Operation(summary = "All badges (unlocked or not), daily streak and knowledge per region")
    @GetMapping("/api/achievements")
    AchievementService.Overview mine(AuthUser user) {
        return achievements.overview(user.id());
    }
}
