package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.UUID;

public record AchievementUnlocked(String eventId, Instant occurredAt, UUID userId, String userName, String code,
        String title) implements DomainEvent {

    public static AchievementUnlocked of(UUID userId, String userName, String code, String title) {
        return new AchievementUnlocked(UUID.randomUUID().toString(), Instant.now(), userId, userName, code, title);
    }

    @Override
    public String topic() {
        return Topics.ACHIEVEMENT_UNLOCKED;
    }

    @Override
    public String key() {
        return userId.toString();
    }
}
