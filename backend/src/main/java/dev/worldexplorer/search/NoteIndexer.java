package dev.worldexplorer.search;

import dev.worldexplorer.atlas.AtlasService;
import dev.worldexplorer.common.events.AtlasChanged;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import java.util.UUID;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Projects notes into Elasticsearch, driven by {@code atlas.changed} events (a small CQRS read model).
 *
 * <p>The event only carries the note id; the indexer reloads the current note from PostgreSQL. That
 * makes it naturally idempotent and order-tolerant: whatever event arrives, the index ends up with the
 * latest state (or deletes it if the note is gone).
 */
@Component
public class NoteIndexer {

    private final AtlasService atlas;
    private final NoteSearchRepository index;
    private final CountryCatalog countries;
    private final IndexBootstrap indices;

    public NoteIndexer(AtlasService atlas, NoteSearchRepository index, CountryCatalog countries, IndexBootstrap indices) {
        this.atlas = atlas;
        this.index = index;
        this.countries = countries;
        this.indices = indices;
    }

    @KafkaListener(id = "note-indexer", topics = Topics.ATLAS_CHANGED, groupId = "note-indexer")
    public void on(AtlasChanged event) {
        if (event.type() != AtlasChanged.Type.NOTE_SAVED && event.type() != AtlasChanged.Type.NOTE_DELETED) return;
        indices.ensure(NoteDocument.class);
        UUID noteId = UUID.fromString(event.refId());
        atlas.findNote(noteId).ifPresentOrElse(
                note -> index.save(new NoteDocument(note.getId().toString(), note.getUserId().toString(),
                        note.getCountryCode(),
                        countries.find(note.getCountryCode()).map(Country::getName).orElse(note.getCountryCode()),
                        note.getTitle(), note.getBody(), note.getUpdatedAt())),
                () -> index.deleteById(noteId.toString()));
    }
}
