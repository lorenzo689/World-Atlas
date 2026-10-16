package dev.worldexplorer.quiz.engine;

import java.util.List;

/**
 * A question as the server knows it – including the answer. Never sent to clients as is; they get a
 * {@link PublicQuestion} instead.
 *
 * @param target the country the question is about (for LOCATE/FLAG it is also the answer)
 * @param answer the id of the correct option (a country code)
 */
public record Question(int index, QuestionType type, String prompt, String target, String answer, List<Option> options) {

    public record Option(String id, String label) {}

    public PublicQuestion toPublic(int total) {
        return new PublicQuestion(index, total, type, prompt, options, type == QuestionType.FLAG,
                type.timeLimit().toSeconds());
    }

    /** What clients see: no answer, and for FLAG questions not even the target (the flag is served by id). */
    public record PublicQuestion(int index, int total, QuestionType type, String prompt, List<Option> options,
            boolean hasFlag, long timeLimitSeconds) {}
}
