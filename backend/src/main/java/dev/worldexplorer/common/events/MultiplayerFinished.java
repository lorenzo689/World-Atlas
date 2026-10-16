package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MultiplayerFinished(
        String eventId, Instant occurredAt, UUID gameId, String roomCode, int rounds, List<Placement> placements)
        implements DomainEvent {

    public record Placement(UUID userId, String name, int score, int placement, int correct, int answered) {}

    @Override
    public String topic() {
        return Topics.MULTIPLAYER_FINISHED;
    }

    @Override
    public String key() {
        return roomCode;
    }
}
