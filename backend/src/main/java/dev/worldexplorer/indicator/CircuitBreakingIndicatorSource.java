package dev.worldexplorer.indicator;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Decorates the retried World Bank adapter with a circuit breaker. Once repeated complete fetches
 * fail, new runs fail fast; after the cool-down only one caller probes the provider.
 */
@Component
@Primary
public class CircuitBreakingIndicatorSource implements IndicatorSource {

    private enum State { CLOSED, OPEN, HALF_OPEN }

    private final IndicatorSource delegate;
    private final LongSupplier nanoTime;
    private final int failureThreshold;
    private final long coolDownNanos;
    private final Counter rejected;
    private State state = State.CLOSED;
    private int failures;
    private long reopenAt;

    @Autowired
    public CircuitBreakingIndicatorSource(@Qualifier("worldBankClient") IndicatorSource delegate,
            MeterRegistry meters) {
        this(delegate, System::nanoTime, 3, Duration.ofMinutes(1),
                Counter.builder("worldbank.circuit.rejected").register(meters));
    }

    CircuitBreakingIndicatorSource(IndicatorSource delegate, LongSupplier nanoTime, int failureThreshold,
            Duration coolDown, Counter rejected) {
        this.delegate = delegate;
        this.nanoTime = nanoTime;
        this.failureThreshold = failureThreshold;
        this.coolDownNanos = coolDown.toNanos();
        this.rejected = rejected;
    }

    @Override
    public List<Row> fetchAll(String indicatorId, int fromYear) {
        acquire();
        try {
            List<Row> rows = delegate.fetchAll(indicatorId, fromYear);
            synchronized (this) {
                state = State.CLOSED;
                failures = 0;
            }
            return rows;
        } catch (RuntimeException error) {
            synchronized (this) {
                if (state == State.HALF_OPEN || ++failures >= failureThreshold) {
                    state = State.OPEN;
                    reopenAt = nanoTime.getAsLong() + coolDownNanos;
                }
            }
            throw error;
        }
    }

    private synchronized void acquire() {
        if (state == State.OPEN && nanoTime.getAsLong() - reopenAt >= 0) {
            state = State.HALF_OPEN;
            return;
        }
        if (state != State.CLOSED) {
            rejected.increment();
            throw new CircuitOpenException();
        }
    }

    static class CircuitOpenException extends IllegalStateException {
        CircuitOpenException() {
            super("World Bank is temporarily unavailable; retry after the circuit cool-down");
        }
    }
}
