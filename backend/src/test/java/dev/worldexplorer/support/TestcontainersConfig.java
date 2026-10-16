package dev.worldexplorer.support;

import java.time.Duration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Real infrastructure for integration tests: the same images as docker-compose.yml, started by
 * Testcontainers. {@code @ServiceConnection} wires the containers' random ports into Spring Boot's
 * connection properties automatically – no URLs in test configuration.
 *
 * <p>Spring caches the test context, so all {@code *IT} classes sharing this configuration share one set
 * of containers.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfig {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:17-alpine");
    }

    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redis() {
        return new GenericContainer<>("redis:8-alpine").withExposedPorts(6379);
    }

    @Bean
    @ServiceConnection
    KafkaContainer kafka() {
        return new KafkaContainer("apache/kafka:4.2.1").withEnv("KAFKA_HEAP_OPTS", "-Xms128m -Xmx384m");
    }

    @Bean
    @ServiceConnection
    ElasticsearchContainer elasticsearch() {
        return new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:9.4.5")
                .withEnv("xpack.security.enabled", "false")
                .withEnv("xpack.ml.enabled", "false")
                .withEnv("ES_JAVA_OPTS", "-Xms384m -Xmx384m")
                // wait for the HTTP API instead of a log line (log formats differ between ES versions)
                .waitingFor(Wait.forHttp("/_cluster/health?wait_for_status=yellow").forPort(9200)
                        .forStatusCode(200).withStartupTimeout(Duration.ofMinutes(4)));
    }
}
