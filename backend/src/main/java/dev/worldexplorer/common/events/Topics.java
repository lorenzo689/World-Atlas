package dev.worldexplorer.common.events;

/**
 * Kafka topic names. One topic per kind of event keeps consumers simple and lets each topic have its
 * own partitioning/retention. Dead-letter topics get the {@link #DLT_SUFFIX}.
 */
public final class Topics {

    /** Raw World Bank observations (high volume, keyed by country so a country's rows stay ordered). */
    public static final String INDICATOR_RAW = "indicator.raw";
    /** One event per finished ingestion run. */
    public static final String INDICATOR_INGESTED = "indicator.ingested";
    public static final String USER_REGISTERED = "user.registered";
    public static final String ATLAS_CHANGED = "atlas.changed";
    public static final String QUIZ_COMPLETED = "quiz.completed";
    public static final String MULTIPLAYER_FINISHED = "multiplayer.finished";
    public static final String ACHIEVEMENT_UNLOCKED = "achievement.unlocked";

    public static final String DLT_SUFFIX = ".dlt";

    /** Domain events that the activity log indexes into Elasticsearch. */
    public static final String[] DOMAIN = {
        INDICATOR_INGESTED, USER_REGISTERED, ATLAS_CHANGED, QUIZ_COMPLETED, MULTIPLAYER_FINISHED, ACHIEVEMENT_UNLOCKED
    };

    private Topics() {}
}
