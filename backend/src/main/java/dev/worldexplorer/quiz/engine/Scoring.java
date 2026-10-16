package dev.worldexplorer.quiz.engine;

import java.time.Duration;

/**
 * Pure scoring rules (no I/O – easy to unit-test, shared by single- and multiplayer).
 *
 * <ul>
 *   <li>correct answer: 1000 points + up to 500 speed bonus (linear: instant = 500, at the limit = 0)
 *   <li>LOCATE near miss: up to 500 points, falling linearly to 0 at {@value #NEAR_MISS_KM} km
 *   <li>too late or wrong: 0
 * </ul>
 */
public final class Scoring {

    public static final int BASE = 1000;
    public static final int MAX_SPEED_BONUS = 500;
    public static final int MAX_NEAR_MISS = 500;
    public static final double NEAR_MISS_KM = 2500;

    public record Result(boolean correct, int points, Double distanceKm, boolean late) {}

    /**
     * @param distanceKm distance between the clicked and the target country (LOCATE only, null otherwise)
     */
    public static Result score(QuestionType type, boolean correct, Double distanceKm, Duration elapsed) {
        Duration limit = type.timeLimit();
        if (elapsed.compareTo(limit) > 0) return new Result(false, 0, distanceKm, true);
        if (correct) {
            double remaining = 1.0 - (double) elapsed.toMillis() / limit.toMillis();
            int bonus = (int) Math.round(MAX_SPEED_BONUS * Math.max(0, remaining));
            return new Result(true, BASE + bonus, type == QuestionType.LOCATE ? 0.0 : null, false);
        }
        if (type == QuestionType.LOCATE && distanceKm != null) {
            int partial = (int) Math.round(MAX_NEAR_MISS * Math.max(0, 1 - distanceKm / NEAR_MISS_KM));
            return new Result(false, partial, distanceKm, false);
        }
        return new Result(false, 0, distanceKm, false);
    }

    private Scoring() {}
}
