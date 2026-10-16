package dev.worldexplorer.indicator;

import java.util.UUID;

/** One raw data point travelling through the {@code indicator.raw} Kafka topic. */
public record IndicatorObservation(UUID runId, String indicatorKey, String countryCode, int year, double value) {}
