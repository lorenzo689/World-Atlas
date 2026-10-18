package dev.worldexplorer.indicator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class CircuitBreakingIndicatorSourceTest {

    @Test
    void opensAfterRepeatedFailuresAndAllowsOneProbeAfterCooldown() {
        AtomicLong clock = new AtomicLong(1);
        AtomicInteger calls = new AtomicInteger();
        IndicatorSource provider = (id, year) -> {
            if (calls.incrementAndGet() <= 3) throw new IllegalStateException("upstream down");
            return List.of(new IndicatorSource.Row("DEU", year, 1));
        };
        var meters = new SimpleMeterRegistry();
        var source = new CircuitBreakingIndicatorSource(provider, clock::get, 3, Duration.ofSeconds(10),
                meters.counter("circuit.rejected"));

        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> source.fetchAll("x", 2020)).hasMessage("upstream down");
        }
        assertThatThrownBy(() -> source.fetchAll("x", 2020))
                .isInstanceOf(CircuitBreakingIndicatorSource.CircuitOpenException.class);
        assertThat(calls).hasValue(3);
        clock.addAndGet(Duration.ofSeconds(10).toNanos());
        assertThat(source.fetchAll("x", 2020)).hasSize(1);
        assertThat(source.fetchAll("x", 2020)).hasSize(1);
        assertThat(calls).hasValue(5);
        assertThat(meters.counter("circuit.rejected").count()).isEqualTo(1);
    }
}
