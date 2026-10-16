package dev.worldexplorer.common.events;

import java.time.Instant;
import java.util.UUID;

/** A change in a user's personal atlas. {@code refId} is the note / view id where relevant. */
public record AtlasChanged(
        String eventId, Instant occurredAt, UUID userId, Type type, String countryCode, String refId)
        implements DomainEvent {

    public enum Type {
        FAVORITE_ADDED,
        FAVORITE_REMOVED,
        TRAVEL_UPDATED,
        TRAVEL_REMOVED,
        NOTE_SAVED,
        NOTE_DELETED,
        VIEW_SAVED,
        VIEW_DELETED
    }

    public static AtlasChanged of(UUID userId, Type type, String countryCode, String refId) {
        return new AtlasChanged(UUID.randomUUID().toString(), Instant.now(), userId, type, countryCode, refId);
    }

    @Override
    public String topic() {
        return Topics.ATLAS_CHANGED;
    }

    @Override
    public String key() {
        return userId.toString();
    }
}
