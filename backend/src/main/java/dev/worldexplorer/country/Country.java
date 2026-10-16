package dev.worldexplorer.country;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Country reference data. Lists that are only ever read as a whole (borders, languages, capitals) are
 * PostgreSQL arrays; currencies are a proper child table ({@code @ElementCollection}) because they have
 * several fields.
 */
@Entity
@Table(name = "country")
public class Country {

    @Id
    private String code;

    @Column(nullable = false, unique = true)
    private String code2;

    @Column(name = "numeric_code")
    private String numericCode;

    @Column(nullable = false)
    private String name;

    @Column(name = "official_name", nullable = false)
    private String officialName;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] capitals = new String[0];

    @Column(nullable = false)
    private String region;

    private String subregion;
    private boolean independent;

    @Column(name = "un_member")
    private boolean unMember;

    private boolean landlocked;

    @Column(name = "area_km2")
    private Double areaKm2;

    private Double lat;
    private Double lng;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] borders = new String[0];

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] languages = new String[0];

    @Column(name = "flag_emoji")
    private String flagEmoji;

    private String demonym;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "country_currency", joinColumns = @JoinColumn(name = "country_code"))
    private List<Currency> currencies = new ArrayList<>();

    protected Country() {}

    public Country(String code, String code2, String numericCode, String name, String officialName,
            List<String> capitals, String region, String subregion, boolean independent, boolean unMember,
            boolean landlocked, Double areaKm2, Double lat, Double lng, List<String> borders, List<String> languages,
            String flagEmoji, String demonym, List<Currency> currencies) {
        this.code = code;
        this.code2 = code2;
        this.numericCode = numericCode;
        this.name = name;
        this.officialName = officialName;
        this.capitals = capitals.toArray(String[]::new);
        this.region = region;
        this.subregion = subregion;
        this.independent = independent;
        this.unMember = unMember;
        this.landlocked = landlocked;
        this.areaKm2 = areaKm2;
        this.lat = lat;
        this.lng = lng;
        this.borders = borders.toArray(String[]::new);
        this.languages = languages.toArray(String[]::new);
        this.flagEmoji = flagEmoji;
        this.demonym = demonym;
        this.currencies = new ArrayList<>(currencies);
    }

    @Embeddable
    public record Currency(
            @Column(name = "code", nullable = false) String code,
            @Column(name = "name", nullable = false) String name,
            @Column(name = "symbol") String symbol) {}

    public String getCode() { return code; }
    public String getCode2() { return code2; }
    public String getNumericCode() { return numericCode; }
    public String getName() { return name; }
    public String getOfficialName() { return officialName; }
    public List<String> getCapitals() { return Arrays.asList(capitals); }
    public String getCapital() { return capitals.length > 0 ? capitals[0] : null; }
    public String getRegion() { return region; }
    public String getSubregion() { return subregion; }
    public boolean isIndependent() { return independent; }
    public boolean isUnMember() { return unMember; }
    public boolean isLandlocked() { return landlocked; }
    public Double getAreaKm2() { return areaKm2; }
    public Double getLat() { return lat; }
    public Double getLng() { return lng; }
    public List<String> getBorders() { return Arrays.asList(borders); }
    public List<String> getLanguages() { return Arrays.asList(languages); }
    public String getFlagEmoji() { return flagEmoji; }
    public String getDemonym() { return demonym; }
    public List<Currency> getCurrencies() { return List.copyOf(currencies); }
}
