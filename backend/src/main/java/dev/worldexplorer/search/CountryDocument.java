package dev.worldexplorer.search;

import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.GeoPointField;
import org.springframework.data.elasticsearch.annotations.InnerField;
import org.springframework.data.elasticsearch.annotations.MultiField;
import org.springframework.data.elasticsearch.annotations.Setting;
import org.springframework.data.elasticsearch.core.geo.GeoPoint;

/**
 * Search document for a country (index {@code countries}).
 *
 * <p>Text fields are analysed twice ({@code @MultiField}): with the {@code folding} analyzer
 * (lowercase + strip accents, so "cote d'ivoire" finds "Côte d'Ivoire") and with an edge-n-gram
 * {@code autocomplete} analyzer (so "germ" already matches "Germany"). {@code location} is a
 * {@code geo_point} for distance queries.
 */
@Document(indexName = "countries", createIndex = false) // created by IndexBootstrap
@Setting(settingPath = "elasticsearch/countries-settings.json")
public record CountryDocument(
        @Id String code,
        @Field(type = FieldType.Keyword) String code2,
        @MultiField(mainField = @Field(type = FieldType.Text, analyzer = "folding"),
                otherFields = {
                    @InnerField(suffix = "auto", type = FieldType.Text, analyzer = "autocomplete", searchAnalyzer = "folding"),
                    @InnerField(suffix = "raw", type = FieldType.Keyword)
                })
        String name,
        @Field(type = FieldType.Text, analyzer = "folding") String officialName,
        @MultiField(mainField = @Field(type = FieldType.Text, analyzer = "folding"),
                otherFields = @InnerField(suffix = "auto", type = FieldType.Text, analyzer = "autocomplete", searchAnalyzer = "folding"))
        List<String> capitals,
        @Field(type = FieldType.Keyword) String region,
        @Field(type = FieldType.Keyword) String subregion,
        @Field(type = FieldType.Text, analyzer = "folding") List<String> languages,
        @Field(type = FieldType.Text, analyzer = "folding") List<String> currencies,
        @Field(type = FieldType.Keyword) String flagEmoji,
        @Field(type = FieldType.Double) Double areaKm2,
        @GeoPointField GeoPoint location) {}
