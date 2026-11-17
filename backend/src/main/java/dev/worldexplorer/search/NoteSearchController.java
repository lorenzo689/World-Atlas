package dev.worldexplorer.search;

import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.search.SearchDtos.NoteHit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Full-text search in the signed-in user's own notes.
 *
 * <p>The URL lives under {@code /api/atlas/**} (same access rule as the rest of the personal atlas),
 * but the endpoint belongs to the search module: search already depends on atlas to index notes, so
 * keeping this endpoint in {@code AtlasController} made the two modules depend on each other.
 * {@code ArchitectureTest} now forbids such cycles.
 */
@Tag(name = "Personal atlas")
@RestController
public class NoteSearchController {

    private final SearchService search;

    public NoteSearchController(SearchService search) {
        this.search = search;
    }

    @Operation(summary = "Full-text search in your notes (Elasticsearch)")
    @GetMapping("/api/atlas/notes/search")
    List<NoteHit> searchNotes(AuthUser user, @RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
        return search.searchNotes(user.id(), q, limit);
    }
}
