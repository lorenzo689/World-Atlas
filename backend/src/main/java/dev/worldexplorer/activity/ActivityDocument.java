package dev.worldexplorer.activity;

import java.time.Instant;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Setting;

/**
 * One domain event in the activity log (index {@code activity}). The id is the event id, so indexing the
 * same Kafka message twice just overwrites the document (idempotent).
 *
 * @param type     e.g. {@code quiz.completed} or {@code atlas.changed:FAVORITE_ADDED} – used for aggregations
 * @param isPublic whether it may appear in the public feed (notes, travel log, views are private)
 * @param payload  the original event, stored but not indexed ({@code enabled = false})
 */
@Document(indexName = "activity", createIndex = false) // created by IndexBootstrap
@Setting(replicas = 0) // single-node cluster: replicas could never be assigned
public record ActivityDocument(
        @Id String id,
        @Field(type = FieldType.Keyword) String type,
        @Field(type = FieldType.Keyword) String topic,
        @Field(type = FieldType.Keyword) String userId,
        @Field(type = FieldType.Keyword) String userName,
        @Field(type = FieldType.Keyword) String countryCode,
        @Field(type = FieldType.Integer) Integer score,
        @Field(type = FieldType.Text) String summary,
        @Field(type = FieldType.Boolean) boolean isPublic,
        @Field(type = FieldType.Date, format = DateFormat.date_time) Instant at,
        @Field(type = FieldType.Object, enabled = false) Map<String, Object> payload) {}
