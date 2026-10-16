package dev.worldexplorer.quiz.engine;

import dev.worldexplorer.country.Country;
import dev.worldexplorer.quiz.engine.Question.Option;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/**
 * Builds a list of questions from the country catalog.
 *
 * <p>The random generator is passed in, which makes generation <b>deterministic for a given seed</b>:
 * the daily challenge seeds it with the date, so every player gets the same questions, and tests can
 * assert exact output.
 */
public class QuestionGenerator {

    /** Countries large enough to be clickable on the globe (tiny islands are frustrating to find). */
    private static final double MIN_LOCATE_AREA_KM2 = 8_000;

    private final List<Country> countries;
    private final Map<String, Double> population;

    /**
     * @param countries  the catalog
     * @param population latest population per country (may be empty – POPULATION questions are skipped then)
     */
    public QuestionGenerator(List<Country> countries, Map<String, Double> population) {
        this.countries = countries.stream().filter(Country::isUnMember).toList();
        this.population = population;
    }

    public List<Question> generate(List<QuestionType> types, String region, int count, RandomGenerator rnd) {
        List<QuestionType> usable = types.stream()
                .filter(t -> t != QuestionType.POPULATION || population.size() > 20)
                .toList();
        if (usable.isEmpty()) usable = List.of(QuestionType.LOCATE, QuestionType.CAPITAL, QuestionType.FLAG);

        List<Country> pool = region == null ? countries
                : countries.stream().filter(c -> c.getRegion().equalsIgnoreCase(region)).toList();
        if (pool.size() < 4) throw new IllegalArgumentException("Not enough countries in region " + region);

        Set<String> used = new HashSet<>();
        List<Question> out = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            QuestionType type = usable.get(i % usable.size()); // even mix, order shuffled below
            out.add(switch (type) {
                case LOCATE -> locate(i, pick(pool, used, rnd, c -> c.getAreaKm2() != null
                        && c.getAreaKm2() >= MIN_LOCATE_AREA_KM2 && c.getLat() != null), rnd);
                case CAPITAL -> capital(i, pick(pool, used, rnd, c -> c.getCapital() != null), pool, rnd);
                case FLAG -> flag(i, pick(pool, used, rnd, c -> true), pool, rnd);
                case POPULATION -> population(i, pick(pool, used, rnd, c -> population.containsKey(c.getCode())), pool, rnd);
            });
        }
        // shuffle question order but keep indexes 0..n-1
        Collections.shuffle(out, rnd);
        List<Question> indexed = new ArrayList<>(count);
        for (int i = 0; i < out.size(); i++) {
            Question q = out.get(i);
            indexed.add(new Question(i, q.type(), q.prompt(), q.target(), q.answer(), q.options()));
        }
        return indexed;
    }

    private Question locate(int i, Country c, RandomGenerator rnd) {
        return new Question(i, QuestionType.LOCATE, "Find " + c.getName() + " on the globe", c.getCode(), c.getCode(), List.of());
    }

    private Question capital(int i, Country c, List<Country> pool, RandomGenerator rnd) {
        List<Option> options = options(c, pool, rnd, 4, x -> x.getCapital() != null, Country::getCapital);
        return new Question(i, QuestionType.CAPITAL, "What is the capital of " + c.getName() + "?", c.getCode(),
                c.getCode(), options);
    }

    private Question flag(int i, Country c, List<Country> pool, RandomGenerator rnd) {
        List<Option> options = options(c, pool, rnd, 4, x -> true, Country::getName);
        return new Question(i, QuestionType.FLAG, "Which country does this flag belong to?", c.getCode(), c.getCode(), options);
    }

    private Question population(int i, Country c, List<Country> pool, RandomGenerator rnd) {
        Country other = pickOther(c, pool, rnd, x -> population.containsKey(x.getCode())
                && Math.abs(Math.log(population.get(x.getCode()) / population.get(c.getCode()))) > 0.05);
        String answer = population.get(c.getCode()) >= population.get(other.getCode()) ? c.getCode() : other.getCode();
        List<Option> options = new ArrayList<>(List.of(new Option(c.getCode(), c.getName()), new Option(other.getCode(), other.getName())));
        Collections.shuffle(options, rnd);
        return new Question(i, QuestionType.POPULATION, "Which country has more inhabitants?", c.getCode(), answer, options);
    }

    /**
     * The correct option plus distractors. Distractors are preferably from the same subregion (harder:
     * "Ljubljana, Zagreb, Sarajevo" instead of "Ljubljana, Lima, Tokyo").
     */
    private List<Option> options(Country correct, List<Country> pool, RandomGenerator rnd, int n,
            Predicate<Country> eligible, java.util.function.Function<Country, String> label) {
        List<Country> near = new ArrayList<>(pool.stream()
                .filter(x -> !x.getCode().equals(correct.getCode()) && eligible.test(x)
                        && x.getSubregion() != null && x.getSubregion().equals(correct.getSubregion()))
                .toList());
        List<Country> far = new ArrayList<>(countries.stream()
                .filter(x -> !x.getCode().equals(correct.getCode()) && eligible.test(x) && !near.contains(x))
                .toList());
        Collections.shuffle(near, rnd);
        Collections.shuffle(far, rnd);
        List<Country> picked = new ArrayList<>();
        picked.add(correct);
        for (Country x : near) if (picked.size() < n) picked.add(x);
        for (Country x : far) if (picked.size() < n) picked.add(x);
        Collections.shuffle(picked, rnd);
        return picked.stream().map(x -> new Option(x.getCode(), label.apply(x))).toList();
    }

    private static Country pick(List<Country> pool, Set<String> used, RandomGenerator rnd, Predicate<Country> ok) {
        List<Country> candidates = pool.stream().filter(c -> !used.contains(c.getCode()) && ok.test(c)).toList();
        if (candidates.isEmpty()) candidates = pool.stream().filter(ok).toList(); // allow repeats in tiny pools
        if (candidates.isEmpty()) throw new IllegalStateException("No country fits the question");
        Country c = candidates.get(rnd.nextInt(candidates.size()));
        used.add(c.getCode());
        return c;
    }

    private Country pickOther(Country c, List<Country> pool, RandomGenerator rnd, Predicate<Country> ok) {
        List<Country> candidates = pool.stream().filter(x -> !x.getCode().equals(c.getCode()) && ok.test(x)).toList();
        if (candidates.isEmpty()) {
            candidates = countries.stream().filter(x -> !x.getCode().equals(c.getCode()) && ok.test(x)).toList();
        }
        return candidates.get(rnd.nextInt(candidates.size()));
    }
}
