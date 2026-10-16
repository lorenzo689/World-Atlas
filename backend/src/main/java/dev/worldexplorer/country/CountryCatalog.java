package dev.worldexplorer.country;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Immutable in-memory snapshot of all countries.
 *
 * <p>Countries change only when the data is re-seeded, but the quiz and the multiplayer game need
 * them constantly (random picks, distractors, distances). Keeping them in memory avoids hundreds of
 * queries per game. The snapshot is swapped atomically after a reseed.
 */
@Component
public class CountryCatalog {

    public record Snapshot(List<Country> all, Map<String, Country> byCode) {}

    private final CountryRepository repository;
    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>();

    public CountryCatalog(CountryRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public void reload() {
        List<Country> all = repository.findAllByOrderByNameAsc();
        Map<String, Country> byCode = all.stream().collect(Collectors.toMap(Country::getCode, Function.identity()));
        snapshot.set(new Snapshot(Collections.unmodifiableList(all), Collections.unmodifiableMap(byCode)));
    }

    public List<Country> all() {
        return current().all();
    }

    public Optional<Country> find(String code) {
        return code == null ? Optional.empty() : Optional.ofNullable(current().byCode().get(code.toUpperCase()));
    }

    public boolean exists(String code) {
        return find(code).isPresent();
    }

    private Snapshot current() {
        Snapshot s = snapshot.get();
        if (s == null) {
            reload();
            s = snapshot.get();
        }
        return s;
    }
}
