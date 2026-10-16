package dev.worldexplorer.atlas;

import dev.worldexplorer.atlas.AtlasDtos.AtlasStats;
import dev.worldexplorer.atlas.AtlasDtos.CountryState;
import dev.worldexplorer.atlas.AtlasDtos.FavoriteDto;
import dev.worldexplorer.atlas.AtlasDtos.NoteDto;
import dev.worldexplorer.atlas.AtlasDtos.NoteRequest;
import dev.worldexplorer.atlas.AtlasDtos.NoteUpdate;
import dev.worldexplorer.atlas.AtlasDtos.TravelDto;
import dev.worldexplorer.atlas.AtlasDtos.TravelRequest;
import dev.worldexplorer.atlas.AtlasDtos.ViewDto;
import dev.worldexplorer.atlas.AtlasDtos.ViewRequest;
import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.search.SearchDtos.NoteHit;
import dev.worldexplorer.search.SearchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Personal atlas API – everything is scoped to the signed-in user (role USER, guests excluded). */
@Tag(name = "Personal atlas")
@RestController
public class AtlasController {

    private final AtlasService atlas;
    private final SearchService search;

    public AtlasController(AtlasService atlas, SearchService search) {
        this.atlas = atlas;
        this.search = search;
    }

    // ---- favourites
    @GetMapping("/api/atlas/favorites")
    List<FavoriteDto> favorites(AuthUser user) {
        return atlas.favorites(user.id());
    }

    @PutMapping("/api/atlas/favorites/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void addFavorite(AuthUser user, @PathVariable String code) {
        atlas.addFavorite(user.id(), code);
    }

    @DeleteMapping("/api/atlas/favorites/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeFavorite(AuthUser user, @PathVariable String code) {
        atlas.removeFavorite(user.id(), code);
    }

    // ---- travel log
    @GetMapping("/api/atlas/travel")
    List<TravelDto> travel(AuthUser user) {
        return atlas.travel(user.id());
    }

    @PutMapping("/api/atlas/travel/{code}")
    TravelDto setTravel(AuthUser user, @PathVariable String code, @Valid @RequestBody TravelRequest body) {
        return atlas.setTravel(user.id(), code, body);
    }

    @DeleteMapping("/api/atlas/travel/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeTravel(AuthUser user, @PathVariable String code) {
        atlas.removeTravel(user.id(), code);
    }

    // ---- notes
    @GetMapping("/api/atlas/notes")
    List<NoteDto> notes(AuthUser user, @RequestParam(required = false) String country) {
        return atlas.notes(user.id(), country);
    }

    @Operation(summary = "Full-text search in your notes (Elasticsearch)")
    @GetMapping("/api/atlas/notes/search")
    List<NoteHit> searchNotes(AuthUser user, @RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
        return search.searchNotes(user.id(), q, limit);
    }

    @PostMapping("/api/atlas/notes")
    @ResponseStatus(HttpStatus.CREATED)
    NoteDto createNote(AuthUser user, @Valid @RequestBody NoteRequest body) {
        return atlas.createNote(user.id(), body);
    }

    @Operation(summary = "Update a note; send the version you loaded (409 if someone saved in between)")
    @PutMapping("/api/atlas/notes/{id}")
    NoteDto updateNote(AuthUser user, @PathVariable UUID id, @Valid @RequestBody NoteUpdate body) {
        return atlas.updateNote(user.id(), id, body);
    }

    @DeleteMapping("/api/atlas/notes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteNote(AuthUser user, @PathVariable UUID id) {
        atlas.deleteNote(user.id(), id);
    }

    // ---- saved views
    @GetMapping("/api/atlas/views")
    List<ViewDto> views(AuthUser user) {
        return atlas.views(user.id());
    }

    @PostMapping("/api/atlas/views")
    @ResponseStatus(HttpStatus.CREATED)
    ViewDto createView(AuthUser user, @Valid @RequestBody ViewRequest body) {
        return atlas.createView(user.id(), body);
    }

    @DeleteMapping("/api/atlas/views/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteView(AuthUser user, @PathVariable UUID id) {
        atlas.deleteView(user.id(), id);
    }

    @Operation(summary = "Open a shared view (public, or your own private one)")
    @GetMapping("/api/views/{slug}")
    ViewDto view(AuthUser user, @PathVariable String slug) {
        return atlas.viewBySlug(slug, user == null ? null : user.id());
    }

    // ---- overview
    @GetMapping("/api/atlas/stats")
    AtlasStats stats(AuthUser user) {
        return atlas.stats(user.id());
    }

    @GetMapping("/api/atlas/countries/{code}")
    CountryState countryState(AuthUser user, @PathVariable String code) {
        return atlas.countryState(user.id(), code);
    }
}
