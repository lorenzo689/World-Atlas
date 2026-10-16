package dev.worldexplorer.country;

import dev.worldexplorer.common.config.CacheNames;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.country.CountryDtos.CountryDetail;
import dev.worldexplorer.country.CountryDtos.CountryList;
import dev.worldexplorer.country.CountryDtos.CountrySummary;
import dev.worldexplorer.country.CountryDtos.CurrencyDto;
import java.util.List;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Read API for countries. Results are cached in Redis ({@code @Cacheable}): the first call computes and
 * stores the value, later calls – from any backend instance – are served from Redis.
 * See {@code CacheConfig} for the per-cache serializers and TTLs.
 */
@Service
public class CountryService {

    private final CountryCatalog catalog;

    public CountryService(CountryCatalog catalog) {
        this.catalog = catalog;
    }

    @Cacheable(cacheNames = CacheNames.COUNTRY_LIST, key = "'all'")
    public CountryList list() {
        return new CountryList(catalog.all().stream().map(CountrySummary::of).toList());
    }

    /** Accepts alpha-3 ("DEU") or alpha-2 ("de"). */
    @Cacheable(cacheNames = CacheNames.COUNTRY_DETAIL, key = "#code.toUpperCase()")
    public CountryDetail get(String code) {
        Country c = resolve(code);
        List<CountrySummary> neighbours = c.getBorders().stream()
                .flatMap(b -> catalog.find(b).stream())
                .map(CountrySummary::of)
                .toList();
        return new CountryDetail(c.getCode(), c.getCode2(), c.getNumericCode(), c.getName(), c.getOfficialName(),
                c.getCapitals(), c.getRegion(), c.getSubregion(), c.isIndependent(), c.isUnMember(), c.isLandlocked(),
                c.getAreaKm2(), c.getLat(), c.getLng(), c.getLanguages(),
                c.getCurrencies().stream().map(x -> new CurrencyDto(x.code(), x.name(), x.symbol())).toList(),
                c.getFlagEmoji(), c.getDemonym(), neighbours);
    }

    public Country resolve(String code) {
        if (code == null) throw ApiException.notFound("Country", null);
        String upper = code.trim().toUpperCase();
        if (upper.length() == 2) {
            return catalog.all().stream().filter(c -> c.getCode2().equals(upper)).findFirst()
                    .orElseThrow(() -> ApiException.notFound("Country", code));
        }
        return catalog.find(upper).orElseThrow(() -> ApiException.notFound("Country", code));
    }

    public void requireExists(String code) {
        if (!catalog.exists(code)) throw ApiException.notFound("Country", code);
    }
}
