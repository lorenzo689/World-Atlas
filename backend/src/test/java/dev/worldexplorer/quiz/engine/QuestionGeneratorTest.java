package dev.worldexplorer.quiz.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.worldexplorer.country.Country;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGeneratorFactory;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class QuestionGeneratorTest {

    private static final List<Country> COUNTRIES = IntStream.range(0, 40)
            .mapToObj(i -> new Country("C%02d".formatted(i), "X" + (char) ('A' + i % 26), null, "Country " + i,
                    "Official " + i, List.of("Capital " + i), i < 20 ? "Europe" : "Asia",
                    i < 10 ? "Western Europe" : i < 20 ? "Eastern Europe" : "Eastern Asia", true, true, false,
                    50_000.0 + i, 10.0 + i, 20.0 + i, List.of(), List.of(), null, null, List.of()))
            .toList();

    private static final Map<String, Double> POPULATION = IntStream.range(0, 40).boxed()
            .collect(java.util.stream.Collectors.toMap(i -> "C%02d".formatted(i), i -> 1_000_000.0 * (i + 1)));

    private final QuestionGenerator generator = new QuestionGenerator(COUNTRIES, POPULATION);

    @Test
    void sameSeedGivesSameQuestions() {
        var a = generator.generate(List.of(QuestionType.values()), null, 10, RandomGeneratorFactory.of("L64X128MixRandom").create(42));
        var b = generator.generate(List.of(QuestionType.values()), null, 10, RandomGeneratorFactory.of("L64X128MixRandom").create(42));
        assertThat(a).isEqualTo(b);
    }

    @Test
    void everyMultipleChoiceQuestionContainsItsAnswerExactlyOnce() {
        var questions = generator.generate(List.of(QuestionType.CAPITAL, QuestionType.FLAG, QuestionType.POPULATION),
                null, 12, RandomGeneratorFactory.of("L64X128MixRandom").create(7));
        assertThat(questions).hasSize(12);
        for (Question q : questions) {
            assertThat(q.options()).extracting(Question.Option::id).containsOnlyOnce(q.answer());
            assertThat(q.options()).extracting(Question.Option::id).doesNotHaveDuplicates();
        }
    }

    @Test
    void populationAnswerIsTheLargerCountry() {
        var questions = generator.generate(List.of(QuestionType.POPULATION), null, 5,
                RandomGeneratorFactory.of("L64X128MixRandom").create(3));
        for (Question q : questions) {
            String bigger = q.answerCountry();
            String other = q.options().stream().map(Question.Option::code).filter(c -> !c.equals(bigger)).findFirst().orElseThrow();
            assertThat(POPULATION.get(bigger)).isGreaterThan(POPULATION.get(other));
        }
    }

    @Test
    void optionIdsDoNotRevealTheAnswer() {
        var questions = generator.generate(List.of(QuestionType.CAPITAL), null, 8,
                RandomGeneratorFactory.of("L64X128MixRandom").create(11));
        for (Question q : questions) {
            // neutral ids, and capital options carry no country code that could be matched to the prompt
            assertThat(q.options()).extracting(Question.Option::id).containsExactly("A", "B", "C", "D");
            assertThat(q.options()).extracting(Question.Option::code).containsOnlyNulls();
            assertThat(q.toPublic(8).subject()).isEqualTo(q.target());
        }
    }

    @Test
    void indexesAreSequentialAndTargetsAreDistinct() {
        var questions = generator.generate(List.of(QuestionType.values()), null, 10,
                RandomGeneratorFactory.of("L64X128MixRandom").create(1));
        assertThat(questions).extracting(Question::index).containsExactly(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        assertThat(questions).extracting(Question::target).doesNotHaveDuplicates();
    }

    @Test
    void regionFilterOnlyAsksAboutThatRegion() {
        var questions = generator.generate(List.of(QuestionType.LOCATE), "Asia", 8,
                RandomGeneratorFactory.of("L64X128MixRandom").create(5));
        assertThat(questions).allSatisfy(q -> assertThat(Integer.parseInt(q.target().substring(1))).isGreaterThanOrEqualTo(20));
    }

    @Test
    void unknownRegionIsRejected() {
        assertThatThrownBy(() -> generator.generate(List.of(QuestionType.LOCATE), "Atlantis", 5,
                RandomGeneratorFactory.of("L64X128MixRandom").create(5)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void publicQuestionHidesTheAnswer() {
        Question q = generator.generate(List.of(QuestionType.FLAG), null, 1,
                RandomGeneratorFactory.of("L64X128MixRandom").create(9)).getFirst();
        Question.PublicQuestion p = q.toPublic(1);
        assertThat(p.hasFlag()).isTrue();
        assertThat(p.toString()).doesNotContain("answer=");
    }

    @Test
    void fallsBackToSupportedStrategiesWhenPopulationIsUnavailable() {
        var withoutPopulation = new QuestionGenerator(COUNTRIES, Map.of());
        var questions = withoutPopulation.generate(List.of(QuestionType.POPULATION), null, 6,
                RandomGeneratorFactory.of("L64X128MixRandom").create(9));
        assertThat(questions).hasSize(6).noneMatch(q -> q.type() == QuestionType.POPULATION);
    }
}
