package dev.worldexplorer.common.events;

import java.time.Instant;

/**
 * Something that happened in one module that other modules may react to.
 *
 * <p>Events are records (immutable, serialised as JSON to Kafka). {@link #eventId()} is globally unique
 * so consumers can be idempotent; {@link #key()} is the Kafka message key and decides the partition
 * (events with the same key are delivered in order).
 */
public sealed interface DomainEvent
        permits UserRegistered, AtlasChanged, QuizCompleted, MultiplayerFinished, IndicatorIngested,
                AchievementUnlocked {

    String eventId();

    Instant occurredAt();

    String topic();

    String key();
}
