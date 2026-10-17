package dev.worldexplorer.quiz.engine;

import java.util.List;

/**
 * A question as the server knows it – including the answer. Never sent to clients as is; they get a
 * {@link PublicQuestion} instead.
 *
 * <p>Multiple-choice options have neutral ids ("A"–"D"). If the ids were country codes, a client could
 * look up the code of the country named in "What is the capital of Kenya?" and pick the matching option.
 *
 * @param target the country the question is about (LOCATE: also the answer)
 * @param answer LOCATE: the target's country code; multiple choice: the id of the correct option
 */
public record Question(int index, QuestionType type, String prompt, String target, String answer, List<Option> options) {

    /**
     * @param code country code of the option, only where it reveals nothing beyond the label (country-name
     *             options of FLAG/POPULATION questions). Null for capitals. Lets the client translate labels.
     */
    public record Option(String id, String label, String code) {}

    public PublicQuestion toPublic(int total) {
        // the subject may be shown: it is named in the prompt anyway (LOCATE, CAPITAL)
        String subject = type == QuestionType.LOCATE || type == QuestionType.CAPITAL ? target : null;
        return new PublicQuestion(index, total, type, prompt, subject, options, type == QuestionType.FLAG,
                type.timeLimit().toSeconds());
    }

    /** The label of the correct option (multiple choice) or null (LOCATE). */
    public String answerLabel() {
        return options.stream().filter(o -> o.id().equals(answer)).map(Option::label).findFirst().orElse(null);
    }

    /** Country code behind the correct answer: LOCATE target, otherwise the correct option's country. */
    public String answerCountry() {
        if (type == QuestionType.LOCATE || type == QuestionType.CAPITAL || type == QuestionType.FLAG) return target;
        return options.stream().filter(o -> o.id().equals(answer)).map(Option::code).findFirst().orElse(target);
    }

    /**
     * What clients see: no answer, and for FLAG questions not even the target (the flag is served by id).
     *
     * @param subject country code of the country named in the prompt, so clients can render the prompt
     *                in their own language (null where it would reveal the answer)
     */
    public record PublicQuestion(int index, int total, QuestionType type, String prompt, String subject,
            List<Option> options, boolean hasFlag, long timeLimitSeconds) {}
}
