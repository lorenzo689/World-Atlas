package dev.worldexplorer.quiz;

public enum QuizMode {
    /** Random questions; ranked on the leaderboards when played with the default settings. */
    CLASSIC,
    /** Same 10 questions for everybody today, one attempt per player and day. */
    DAILY,
    /** A shared duel link: same seeded questions for everybody who opens it, one attempt each. */
    CHALLENGE
}
