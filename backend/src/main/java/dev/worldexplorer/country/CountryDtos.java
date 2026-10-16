package dev.worldexplorer.country;

import java.util.List;

public final class CountryDtos {

    /** Compact representation for lists, quiz options, leaderboards … */
    public record CountrySummary(
            String code, String code2, String name, String capital, String region, String subregion,
            Double lat, Double lng, String flagEmoji) {

        public static CountrySummary of(Country c) {
            return new CountrySummary(c.getCode(), c.getCode2(), c.getName(), c.getCapital(), c.getRegion(),
                    c.getSubregion(), c.getLat(), c.getLng(), c.getFlagEmoji());
        }
    }

    public record CurrencyDto(String code, String name, String symbol) {}

    public record CountryDetail(
            String code, String code2, String numericCode, String name, String officialName,
            List<String> capitals, String region, String subregion, boolean independent, boolean unMember,
            boolean landlocked, Double areaKm2, Double lat, Double lng, List<String> languages,
            List<CurrencyDto> currencies, String flagEmoji, String demonym, List<CountrySummary> neighbours) {}

    /** Wrapper so the whole list can be cached as one typed Redis value. */
    public record CountryList(List<CountrySummary> items) {}

    private CountryDtos() {}
}
