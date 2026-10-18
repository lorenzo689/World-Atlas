package dev.worldexplorer.country;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds the {@code country} table on startup from {@code data/countries.json} – the same file the
 * frontend uses (Maven copies it from {@code ../frontend/public/data} into the jar, see pom.xml).
 *
 * <p>Runs only when the table is empty, then announces {@link CountriesSeeded} so that the search
 * module can (re)index Elasticsearch.
 */
@Component
@Order(1)
public class CountrySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CountrySeeder.class);

    /** Shape of one entry in countries.json (only the fields the backend needs). */
    record JsonCountry(
            String code, String code2, String numeric, String name, String officialName, List<String> capital,
            String region, String subregion, Boolean independent, Boolean unMember, Boolean landlocked, Double area,
            List<Double> latlng, List<String> borders, List<JsonCurrency> currencies, List<String> languages,
            String flagEmoji, String demonym) {}

    record JsonCurrency(String code, String name, String symbol) {}

    /** Published after seeding (or when the table already had data) – a plain Spring event. */
    public record CountriesSeeded(int count, boolean fresh) {}

    private final CountryRepository repository;
    private final CountryCatalog catalog;
    private final JsonMapper json;
    private final TransactionTemplate tx;
    private final ApplicationEventPublisher events;

    public CountrySeeder(CountryRepository repository, CountryCatalog catalog, JsonMapper json, TransactionTemplate tx,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.catalog = catalog;
        this.json = json;
        this.tx = tx;
        this.events = events;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        long existing = repository.count();
        boolean fresh = false;
        if (existing == 0) {
            List<Country> countries = read().stream().map(CountrySeeder::toEntity).toList();
            tx.executeWithoutResult(s -> repository.saveAll(countries));
            log.info("Seeded {} countries", countries.size());
            fresh = true;
        }
        catalog.reload();
        events.publishEvent(new CountriesSeeded(catalog.all().size(), fresh));
    }

    List<JsonCountry> read() throws IOException {
        try (InputStream in = new ClassPathResource("data/countries.json").getInputStream()) {
            return List.of(json.readValue(in, JsonCountry[].class));
        }
    }

    static Country toEntity(JsonCountry c) {
        Double lat = c.latlng() != null && c.latlng().size() == 2 ? c.latlng().get(0) : null;
        Double lng = c.latlng() != null && c.latlng().size() == 2 ? c.latlng().get(1) : null;
        List<Country.Currency> currencies = c.currencies() == null ? List.of()
                : c.currencies().stream()
                        .filter(x -> x.code() != null && x.name() != null)
                        .map(x -> new Country.Currency(x.code(), x.name(), x.symbol()))
                        .toList();
        return new Country(c.code(), c.code2(), c.numeric(), c.name(), c.officialName(), orEmpty(c.capital()),
                c.region(), c.subregion(), bool(c.independent()), bool(c.unMember()), bool(c.landlocked()), c.area(),
                lat, lng, orEmpty(c.borders()), orEmpty(c.languages()), c.flagEmoji(), c.demonym(), currencies);
    }

    private static List<String> orEmpty(List<String> l) {
        return l == null ? List.of() : l;
    }

    private static boolean bool(Boolean b) {
        return Boolean.TRUE.equals(b);
    }
}
