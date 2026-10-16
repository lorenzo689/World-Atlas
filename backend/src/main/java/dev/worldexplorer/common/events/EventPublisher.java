package dev.worldexplorer.common.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Publishes domain events to Kafka <em>after</em> the surrounding database transaction committed.
 *
 * <p>Services call {@link #publish(DomainEvent)} inside their {@code @Transactional} method. The event is
 * first a Spring application event; {@link #forward} only runs once the transaction committed
 * ({@code AFTER_COMMIT}), so consumers never see an event for data that was rolled back.
 * Outside a transaction it is forwarded immediately ({@code fallbackExecution = true}).
 *
 * <p>Trade-off (worth knowing): if the process dies between commit and send, the event is lost.
 * The bullet-proof alternative is the transactional outbox pattern (write the event into a table in
 * the same transaction and relay it to Kafka asynchronously).
 */
@Component
public class EventPublisher {

    private static final Logger log = LoggerFactory.getLogger(EventPublisher.class);

    private final ApplicationEventPublisher springEvents;
    private final KafkaTemplate<Object, Object> kafka;

    public EventPublisher(ApplicationEventPublisher springEvents, KafkaTemplate<Object, Object> kafka) {
        this.springEvents = springEvents;
        this.kafka = kafka;
    }

    public void publish(DomainEvent event) {
        springEvents.publishEvent(event);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void forward(DomainEvent event) {
        kafka.send(event.topic(), event.key(), event).whenComplete((result, ex) -> {
            if (ex != null) log.warn("Could not publish {} {}: {}", event.topic(), event.eventId(), ex.getMessage());
        });
    }
}
