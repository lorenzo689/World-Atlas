package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.worldexplorer.activity.OutboxOperationsService;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.OutboxRelay;
import dev.worldexplorer.common.events.UserRegistered;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

/** Exercises the operator SQL against PostgreSQL without starting unrelated application services. */
@Testcontainers
class OutboxOperationsIT {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    JdbcClient jdbc;
    OutboxOperationsService outbox;

    @BeforeEach
    void setUp() {
        jdbc = JdbcClient.create(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(),
                postgres.getPassword()));
        jdbc.sql("""
                        create table if not exists outbox_event (
                            id uuid primary key, topic varchar(80) not null, msg_key varchar(120) not null,
                            type varchar(200) not null, payload text not null,
                            created_at timestamptz not null default now(), sent_at timestamptz,
                            attempts integer not null default 0, last_error text,
                            next_attempt_at timestamptz not null default now()
                        )
                        """).update();
        jdbc.sql("truncate outbox_event").update();
        outbox = new OutboxOperationsService(jdbc);
    }

    @Test
    void exhaustedEventCanBeRetriedOnlyOnce() {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        insert into outbox_event (id, topic, msg_key, type, payload, attempts, last_error)
                        values (:id, 'test.topic', 'test-key', 'test.Type', '{}', 20, 'broker unavailable')
                        """)
                .param("id", id).update();

        assertThat(outbox.status().pending()).isZero();
        assertThat(outbox.status().failed()).isEqualTo(1);
        assertThat(outbox.status().failures()).anySatisfy(event -> {
            assertThat(event.id()).isEqualTo(id);
            assertThat(event.lastError()).isEqualTo("broker unavailable");
        });

        outbox.retry(id);
        assertThat(jdbc.sql("select attempts from outbox_event where id = :id")
                .param("id", id).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("select last_error from outbox_event where id = :id")
                .param("id", id).query(String.class).optional()).isEmpty();
        assertThat(outbox.status().pending()).isEqualTo(1);
        assertThatThrownBy(() -> outbox.retry(id)).isInstanceOf(ApiException.class);
    }

    @SuppressWarnings("unchecked")
    @Test
    void brokerFailureSchedulesRetryAndRecoveryDeliversEvent() throws Exception {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into outbox_event (id, topic, msg_key, type, payload)
                values (:id, 'test.topic', 'test-key', :type, '{}')
                """).param("id", id).param("type", UserRegistered.class.getName()).update();

        KafkaTemplate<Object, Object> kafka = mock(KafkaTemplate.class);
        JsonMapper json = mock(JsonMapper.class);
        var event = new UserRegistered(id.toString(), Instant.now(), id, "Drill", true);
        when(json.readValue("{}", UserRegistered.class)).thenReturn(event);
        when(kafka.send(eq("test.topic"), eq("test-key"), any()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("broker down")))
                .thenReturn(CompletableFuture.completedFuture(null));
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        var relay = new OutboxRelay(jdbc, new TransactionTemplate(new DataSourceTransactionManager(ds)),
                kafka, json, new SimpleMeterRegistry());

        relay.relay();
        assertThat(jdbc.sql("select attempts from outbox_event where id = :id")
                .param("id", id).query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select next_attempt_at > now() from outbox_event where id = :id")
                .param("id", id).query(Boolean.class).single()).isTrue();
        relay.relay();
        assertThat(jdbc.sql("select attempts from outbox_event where id = :id")
                .param("id", id).query(Integer.class).single()).isEqualTo(1);

        jdbc.sql("update outbox_event set next_attempt_at = now() - interval '1 second' where id = :id")
                .param("id", id).update();
        relay.relay();
        assertThat(jdbc.sql("select sent_at is not null from outbox_event where id = :id")
                .param("id", id).query(Boolean.class).single()).isTrue();
    }
}
