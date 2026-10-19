package dev.worldexplorer.quiz;

import dev.worldexplorer.country.CountryCatalog;
import dev.worldexplorer.indicator.IndicatorQueryService;
import dev.worldexplorer.quiz.engine.Question;
import dev.worldexplorer.quiz.engine.QuestionGenerator;
import dev.worldexplorer.quiz.engine.QuestionType;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGenerator;
import java.util.random.RandomGeneratorFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Spring-side wrapper that feeds the pure {@link QuestionGenerator} with countries and population data. */
@Component
public class QuestionFactory {

    private static final Logger log = LoggerFactory.getLogger(QuestionFactory.class);
    private static final RandomGeneratorFactory<RandomGenerator> RANDOM = RandomGeneratorFactory.of("L64X128MixRandom");

    private final CountryCatalog countries;
    private final IndicatorQueryService indicators;

    public QuestionFactory(CountryCatalog countries, IndicatorQueryService indicators) {
        this.countries = countries;
        this.indicators = indicators;
    }

    public List<Question> random(List<QuestionType> types, String region, int count) {
        return generator().generate(types, region, count, RANDOM.create());
    }

    public List<Question> review(List<QuestionGenerator.Target> targets) {
        return generator().review(targets, RANDOM.create());
    }

    /** Deterministic: the same seed always yields the same questions. */
    public List<Question> seeded(List<QuestionType> types, String region, int count, long seed) {
        return generator().generate(types, region, count, RANDOM.create(seed));
    }

    private QuestionGenerator generator() {
        Map<String, Double> population;
        try {
            population = indicators.latestNumbers("population");
        } catch (Exception e) {
            log.debug("No population data for quiz: {}", e.getMessage());
            population = Map.of();
        }
        return new QuestionGenerator(countries.all(), population);
    }
}
