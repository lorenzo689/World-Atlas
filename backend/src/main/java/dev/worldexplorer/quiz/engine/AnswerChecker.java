package dev.worldexplorer.quiz.engine;

import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import java.time.Duration;
import org.springframework.stereotype.Component;

/** Checks an answer against a question and scores it. Used by single- and multiplayer. */
@Component
public class AnswerChecker {

    private final CountryCatalog countries;

    public AnswerChecker(CountryCatalog countries) {
        this.countries = countries;
    }

    public Scoring.Result check(Question q, String answer, Duration elapsed) {
        String given = answer == null ? "" : answer.trim().toUpperCase();
        boolean correct = q.answer().equals(given);
        Double distance = null;
        if (q.type() == QuestionType.LOCATE && !correct) {
            Country target = countries.find(q.target()).orElse(null);
            Country clicked = countries.find(given).orElse(null);
            if (target != null && clicked != null && target.getLat() != null && clicked.getLat() != null) {
                distance = Geo.distanceKm(target.getLat(), target.getLng(), clicked.getLat(), clicked.getLng());
            }
        }
        return Scoring.score(q.type(), correct, distance, elapsed);
    }

    /** Human-readable correct answer, e.g. "Nairobi" for a capital question. */
    public String correctLabel(Question q) {
        Country c = countries.find(q.answer()).orElse(null);
        if (c == null) return q.answer();
        return q.type() == QuestionType.CAPITAL ? c.getCapital() : c.getName();
    }
}
