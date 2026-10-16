package dev.worldexplorer.search;

import dev.worldexplorer.activity.ActivityDocument;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Creates the Elasticsearch indices with their settings and mappings.
 *
 * <p>By default Spring Data creates indices while the repositories are being built – if Elasticsearch
 * is not reachable at that moment, the whole application fails to start. Here the documents use
 * {@code createIndex = false} and the indices are created
 * <ul>
 *   <li>in the background after startup, retrying until Elasticsearch is up, and
 *   <li>on demand right before the first write ({@link #ensure}), so a write never auto-creates an
 *       index with a guessed ("dynamic") mapping.
 * </ul>
 * The rest of the application works while Elasticsearch is down; only search/analytics fail.
 */
@Component
public class IndexBootstrap {

    private static final Logger log = LoggerFactory.getLogger(IndexBootstrap.class);
    private static final List<Class<?>> DOCUMENTS = List.of(CountryDocument.class, NoteDocument.class, ActivityDocument.class);

    private final ElasticsearchOperations es;
    private final Set<Class<?>> ready = ConcurrentHashMap.newKeySet();

    public IndexBootstrap(ElasticsearchOperations es) {
        this.es = es;
    }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void createAll() {
        for (int attempt = 1; attempt <= 30; attempt++) {
            try {
                DOCUMENTS.forEach(this::ensure);
                return;
            } catch (Exception e) {
                log.info("Elasticsearch not ready yet (attempt {}): {}", attempt, e.getMessage());
                sleep(Math.min(10_000, 1_000L * attempt));
            }
        }
        log.warn("Elasticsearch indices could not be created; search will be unavailable");
    }

    /** Idempotent: creates the index with settings + mapping if it does not exist yet. */
    public void ensure(Class<?> document) {
        if (ready.contains(document)) return;
        synchronized (this) {
            if (ready.contains(document)) return;
            IndexOperations ops = es.indexOps(document);
            if (!ops.exists()) {
                ops.createWithMapping();
                log.info("Created Elasticsearch index {}", ops.getIndexCoordinates().getIndexName());
            }
            ready.add(document);
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
