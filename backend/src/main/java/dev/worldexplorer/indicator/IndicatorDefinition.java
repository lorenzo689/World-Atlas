package dev.worldexplorer.indicator;

import dev.worldexplorer.common.error.ApiException;
import java.util.Arrays;

/**
 * The indicators the platform ingests. The keys are the same as in the frontend
 * ({@code src/lib/indicators.ts}), the ids are World Bank indicator codes.
 */
public enum IndicatorDefinition {
    POPULATION("population", "SP.POP.TOTL", "Population, total", "people"),
    POPULATION_GROWTH("populationGrowth", "SP.POP.GROW", "Population growth (annual %)", "% per year"),
    DENSITY("density", "EN.POP.DNST", "Population density (people per km² of land area)", "people per km²"),
    LIFE_EXPECTANCY("lifeExpectancy", "SP.DYN.LE00.IN", "Life expectancy at birth, total (years)", "years"),
    URBANIZATION("urbanization", "SP.URB.TOTL.IN.ZS", "Urban population (% of total population)", "% of population"),
    AGE_0_14("age0_14", "SP.POP.0014.TO.ZS", "Population ages 0–14 (% of total population)", "% of population"),
    AGE_15_64("age15_64", "SP.POP.1564.TO.ZS", "Population ages 15–64 (% of total population)", "% of population"),
    AGE_65_PLUS("age65plus", "SP.POP.65UP.TO.ZS", "Population ages 65 and above (% of total population)", "% of population"),
    BIRTH_RATE("birthRate", "SP.DYN.CBRT.IN", "Birth rate, crude (per 1,000 people)", "per 1,000 people"),
    DEATH_RATE("deathRate", "SP.DYN.CDRT.IN", "Death rate, crude (per 1,000 people)", "per 1,000 people"),
    FERTILITY("fertility", "SP.DYN.TFRT.IN", "Fertility rate, total (births per woman)", "births per woman"),
    GDP("gdp", "NY.GDP.MKTP.CD", "GDP (current US$)", "current US$"),
    GDP_PER_CAPITA("gdpPerCapita", "NY.GDP.PCAP.CD", "GDP per capita (current US$)", "current US$"),
    GDP_GROWTH("gdpGrowth", "NY.GDP.MKTP.KD.ZG", "GDP growth (annual %)", "% per year"),
    INFLATION("inflation", "FP.CPI.TOTL.ZG", "Inflation, consumer prices (annual %)", "% per year"),
    UNEMPLOYMENT("unemployment", "SL.UEM.TOTL.ZS", "Unemployment, total (% of labour force, modeled ILO estimate)", "% of labour force");

    private final String key;
    private final String worldBankId;
    private final String label;
    private final String unit;

    IndicatorDefinition(String key, String worldBankId, String label, String unit) {
        this.key = key;
        this.worldBankId = worldBankId;
        this.label = label;
        this.unit = unit;
    }

    public String key() { return key; }
    public String worldBankId() { return worldBankId; }
    public String label() { return label; }
    public String unit() { return unit; }

    /** Accepts the key ("gdpPerCapita") or the World Bank id ("NY.GDP.PCAP.CD"). */
    public static IndicatorDefinition of(String keyOrId) {
        return Arrays.stream(values())
                .filter(d -> d.key.equals(keyOrId) || d.worldBankId.equalsIgnoreCase(keyOrId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("Indicator", keyOrId));
    }
}
