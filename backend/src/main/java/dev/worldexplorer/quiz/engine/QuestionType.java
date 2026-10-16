package dev.worldexplorer.quiz.engine;

import java.time.Duration;

/** The kinds of questions. Each has its own time limit. */
public enum QuestionType {
    /** "Find Peru" – the player clicks a country on the globe. Near misses earn partial points. */
    LOCATE(Duration.ofSeconds(25)),
    /** "What is the capital of Kenya?" – 4 options. */
    CAPITAL(Duration.ofSeconds(15)),
    /** A flag is shown – "Which country is this?" – 4 options. */
    FLAG(Duration.ofSeconds(15)),
    /** "Which has more inhabitants?" – 2 options, needs population data from the data platform. */
    POPULATION(Duration.ofSeconds(12));

    private final Duration timeLimit;

    QuestionType(Duration timeLimit) {
        this.timeLimit = timeLimit;
    }

    public Duration timeLimit() {
        return timeLimit;
    }
}
