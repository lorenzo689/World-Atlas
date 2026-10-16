package dev.worldexplorer.country;

import dev.worldexplorer.country.CountryDtos.CountryDetail;
import dev.worldexplorer.country.CountryDtos.CountrySummary;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Countries")
@RestController
@RequestMapping("/api/countries")
public class CountryController {

    private final CountryService countries;

    public CountryController(CountryService countries) {
        this.countries = countries;
    }

    /** Reference data rarely changes: let browsers and CDNs cache it for an hour. */
    @GetMapping
    ResponseEntity<List<CountrySummary>> list() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(countries.list().items());
    }

    @GetMapping("/{code}")
    ResponseEntity<CountryDetail> get(@PathVariable String code) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(countries.get(code));
    }
}
