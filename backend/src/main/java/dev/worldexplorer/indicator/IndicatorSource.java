package dev.worldexplorer.indicator;

import java.util.List;

/** The ingestion port. Providers return observations; transport details stay outside the pipeline. */
public interface IndicatorSource {

    record Row(String countryCode, int year, double value) {}

    List<Row> fetchAll(String indicatorId, int fromYear);
}
