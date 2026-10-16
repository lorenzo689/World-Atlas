package dev.worldexplorer.common.events;

import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

/**
 * Kafka setup:
 * <ul>
 *   <li>topics are declared as beans; {@link KafkaAdmin} creates missing ones at startup
 *   <li>a shared error handler: retry twice, then send the record to {@code <topic>.dlt}
 *   <li>{@code batchFactory}: batch listener for the high-volume ingestion topic
 *   <li>{@code rawJsonFactory}: values as plain JSON strings (generic consumers such as the activity log)
 * </ul>
 * The default single-record JSON factory comes from Spring Boot's auto-configuration and picks up the
 * error handler bean automatically.
 */
@Configuration
public class KafkaConfig {

    // ---- topics ------------------------------------------------------------------------------
    @Bean
    KafkaAdmin.NewTopics topics() {
        return new KafkaAdmin.NewTopics(
                topic(Topics.INDICATOR_RAW, 6),
                topic(Topics.INDICATOR_RAW + Topics.DLT_SUFFIX, 1),
                topic(Topics.INDICATOR_INGESTED, 1),
                topic(Topics.USER_REGISTERED, 3),
                topic(Topics.ATLAS_CHANGED, 3),
                topic(Topics.ATLAS_CHANGED + Topics.DLT_SUFFIX, 1),
                topic(Topics.QUIZ_COMPLETED, 3),
                topic(Topics.QUIZ_COMPLETED + Topics.DLT_SUFFIX, 1),
                topic(Topics.MULTIPLAYER_FINISHED, 3),
                topic(Topics.MULTIPLAYER_FINISHED + Topics.DLT_SUFFIX, 1),
                topic(Topics.INDICATOR_INGESTED + Topics.DLT_SUFFIX, 1),
                topic(Topics.USER_REGISTERED + Topics.DLT_SUFFIX, 1));
    }

    private static NewTopic topic(String name, int partitions) {
        return TopicBuilder.name(name).partitions(partitions).replicas(1).build();
    }

    // ---- error handling ------------------------------------------------------------------------
    /** Retry a failing record 2× (500 ms apart), then park it on the dead-letter topic. */
    @Bean
    DefaultErrorHandler kafkaErrorHandler(KafkaOperations<Object, Object> template) {
        var recoverer = new DeadLetterPublishingRecoverer(template,
                (record, ex) -> new TopicPartition(record.topic() + Topics.DLT_SUFFIX, -1));
        return new DefaultErrorHandler(recoverer, new FixedBackOff(500, 2));
    }

    // ---- container factories -------------------------------------------------------------------
    @Bean
    ConcurrentKafkaListenerContainerFactory<Object, Object> batchFactory(
            ConsumerFactory<Object, Object> consumerFactory, DefaultErrorHandler errorHandler) {
        var factory = new ConcurrentKafkaListenerContainerFactory<Object, Object>();
        factory.setConsumerFactory(consumerFactory);
        factory.setBatchListener(true);
        factory.setConcurrency(3);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }

    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> rawJsonFactory(
            KafkaProperties properties, DefaultErrorHandler errorHandler) {
        Map<String, Object> config = new HashMap<>(properties.buildConsumerProperties());
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        var factory = new ConcurrentKafkaListenerContainerFactory<String, String>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(config));
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
