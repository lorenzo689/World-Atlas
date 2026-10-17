package dev.worldexplorer.achievement;

import dev.worldexplorer.common.events.AchievementUnlocked;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.multiplayer.RoomBroadcaster;
import java.util.Map;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Pushes "badge unlocked" to the player's browser over WebSocket ({@code /user/queue/notifications}).
 * Kafka → this consumer → Redis pub/sub → every instance → the player's WebSocket session(s).
 */
@Component
public class AchievementNotifier {

    private final RoomBroadcaster broadcaster;

    public AchievementNotifier(RoomBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @KafkaListener(id = "achievement-notifier", topics = Topics.ACHIEVEMENT_UNLOCKED, groupId = "achievement-notifier")
    public void on(AchievementUnlocked e) {
        Achievement a = Achievement.valueOf(e.code());
        broadcaster.toUser(e.userId(), "/queue/notifications", "ACHIEVEMENT_UNLOCKED",
                Map.of("code", a.name(), "title", a.title(), "description", a.description(), "icon", a.icon()));
    }
}
