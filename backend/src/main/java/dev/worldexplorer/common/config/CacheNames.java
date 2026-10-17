package dev.worldexplorer.common.config;

/** Names of the Redis-backed Spring caches (configured in {@code common.config.CacheConfig}). */
public final class CacheNames {

    public static final String COUNTRY_LIST = "country-list";
    public static final String COUNTRY_DETAIL = "country-detail";
    public static final String INDICATOR_LATEST = "indicator-latest";
    public static final String INDICATOR_STATS = "indicator-stats";
    public static final String INDICATOR_CATALOG = "indicator-catalog";
    public static final String INDICATOR_AT = "indicator-at";

    private CacheNames() {}
}
