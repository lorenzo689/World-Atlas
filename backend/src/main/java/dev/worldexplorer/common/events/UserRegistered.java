package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.UUID;

public record UserRegistered(String eventId, Instant occurredAt, UUID userId, String displayName, boolean guest)
        implements DomainEvent {

    public static UserRegistered of(UUID userId, String displayName, boolean guest) {
        return new UserRegistered(UUID.randomUUID().toString(), Instant.now(), userId, displayName, guest);
    }

    @Override
    public String topic() {
        return Topics.USER_REGISTERED;
    }

    @Override
    public String key() {
        return userId.toString();
    }
}
