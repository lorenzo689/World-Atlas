package dev.worldexplorer.search;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Setting;

/**
 * A user's note in Elasticsearch (index {@code notes}). PostgreSQL stays the source of truth; this is a
 * read model kept up to date from {@code atlas.changed} events (see {@link NoteIndexer}).
 * Every query filters by {@code userId}, so users only ever search their own notes.
 */
@Document(indexName = "notes", createIndex = false) // created by IndexBootstrap
@Setting(settingPath = "elasticsearch/countries-settings.json")
public record NoteDocument(
        @Id String id,
        @Field(type = FieldType.Keyword) String userId,
        @Field(type = FieldType.Keyword) String countryCode,
        @Field(type = FieldType.Text, analyzer = "folding") String countryName,
        @Field(type = FieldType.Text, analyzer = "folding") String title,
        @Field(type = FieldType.Text, analyzer = "folding") String body,
        @Field(type = FieldType.Date, format = DateFormat.date_time) Instant updatedAt) {}
