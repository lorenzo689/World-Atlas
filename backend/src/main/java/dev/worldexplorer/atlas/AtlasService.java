package dev.worldexplorer.atlas;

import dev.worldexplorer.atlas.AtlasDtos.AtlasStats;
import dev.worldexplorer.atlas.AtlasDtos.CountryState;
import dev.worldexplorer.atlas.AtlasDtos.FavoriteDto;
import dev.worldexplorer.atlas.AtlasDtos.NoteDto;
import dev.worldexplorer.atlas.AtlasDtos.NoteRequest;
import dev.worldexplorer.atlas.AtlasDtos.NoteUpdate;
import dev.worldexplorer.atlas.AtlasDtos.RegionProgress;
import dev.worldexplorer.atlas.AtlasDtos.TravelDto;
import dev.worldexplorer.atlas.AtlasDtos.TravelRequest;
import dev.worldexplorer.atlas.AtlasDtos.ViewDto;
import dev.worldexplorer.atlas.AtlasDtos.ViewRequest;
import dev.worldexplorer.auth.AppUser;
import dev.worldexplorer.auth.AppUserRepository;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.AtlasChanged;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.country.Country;
import dev.worldexplorer.country.CountryCatalog;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The personal atlas. Every write publishes an {@link AtlasChanged} event (after commit) which feeds the
 * note search index and the activity log.
 */
@Service
@Transactional
public class AtlasService {

    private final FavoriteRepository favorites;
    private final TravelRepository travel;
    private final NoteRepository notes;
    private final SavedViewRepository views;
    private final AppUserRepository users;
    private final CountryCatalog countries;
    private final SlugGenerator slugs;
    private final EventPublisher events;

    public AtlasService(FavoriteRepository favorites, TravelRepository travel, NoteRepository notes,
            SavedViewRepository views, AppUserRepository users, CountryCatalog countries, SlugGenerator slugs,
            EventPublisher events) {
        this.favorites = favorites;
        this.travel = travel;
        this.notes = notes;
        this.views = views;
        this.users = users;
        this.countries = countries;
        this.slugs = slugs;
        this.events = events;
    }

    // ---- favourites ----------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<FavoriteDto> favorites(UUID userId) {
        return favorites.findByUserIdOrderByCreatedAtDesc(userId).stream().map(f -> {
            Country c = country(f.getCountryCode());
            return new FavoriteDto(c.getCode(), c.getName(), c.getRegion(), c.getFlagEmoji(), f.getCreatedAt());
        }).toList();
    }

    /** Idempotent: adding an existing favourite is a no-op (PUT semantics). */
    public void addFavorite(UUID userId, String code) {
        String cc = country(code).getCode();
        if (favorites.existsById(new UserCountryId(userId, cc))) return;
        favorites.save(new Favorite(userId, cc));
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.FAVORITE_ADDED, cc, null));
    }

    public void removeFavorite(UUID userId, String code) {
        String cc = code.toUpperCase();
        UserCountryId id = new UserCountryId(userId, cc);
        if (!favorites.existsById(id)) return;
        favorites.deleteById(id);
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.FAVORITE_REMOVED, cc, null));
    }

    // ---- travel log ------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TravelDto> travel(UUID userId) {
        return travel.findByUserIdOrderByUpdatedAtDesc(userId).stream().map(t -> {
            Country c = country(t.getCountryCode());
            return new TravelDto(c.getCode(), c.getName(), c.getRegion(), c.getFlagEmoji(), t.getStatus(),
                    t.getVisitedOn(), t.getRating(), t.getUpdatedAt());
        }).toList();
    }

    public TravelDto setTravel(UUID userId, String code, TravelRequest req) {
        Country c = country(code);
        if (req.status() == TravelEntry.Status.WISHLIST && (req.visitedOn() != null || req.rating() != null)) {
            throw ApiException.badRequest("invalid_travel", "A wishlist entry has no visit date or rating.");
        }
        TravelEntry entry = travel.findById(new UserCountryId(userId, c.getCode()))
                .orElseGet(() -> new TravelEntry(userId, c.getCode()));
        entry.update(req.status(), req.visitedOn(), req.rating());
        travel.save(entry);
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.TRAVEL_UPDATED, c.getCode(), req.status().name()));
        return new TravelDto(c.getCode(), c.getName(), c.getRegion(), c.getFlagEmoji(), entry.getStatus(),
                entry.getVisitedOn(), entry.getRating(), entry.getUpdatedAt());
    }

    public void removeTravel(UUID userId, String code) {
        UserCountryId id = new UserCountryId(userId, code.toUpperCase());
        if (!travel.existsById(id)) return;
        travel.deleteById(id);
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.TRAVEL_REMOVED, id.countryCode(), null));
    }

    // ---- notes -----------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<NoteDto> notes(UUID userId, String countryCode) {
        List<Note> list = countryCode == null
                ? notes.findByUserIdOrderByUpdatedAtDesc(userId)
                : notes.findByUserIdAndCountryCodeOrderByUpdatedAtDesc(userId, countryCode.toUpperCase());
        return list.stream().map(this::toDto).toList();
    }

    public NoteDto createNote(UUID userId, NoteRequest req) {
        Country c = country(req.countryCode());
        Note note = notes.save(new Note(userId, c.getCode(), req.title().trim(), req.body() == null ? "" : req.body()));
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.NOTE_SAVED, c.getCode(), note.getId().toString()));
        return toDto(note);
    }

    public NoteDto updateNote(UUID userId, UUID noteId, NoteUpdate req) {
        Note note = notes.findByIdAndUserId(noteId, userId).orElseThrow(() -> ApiException.notFound("Note", noteId));
        if (note.getVersion() != req.version()) {
            // the client edited an outdated copy
            throw new OptimisticLockingFailureException("Note " + noteId + " has version " + note.getVersion());
        }
        note.edit(req.title().trim(), req.body() == null ? "" : req.body());
        notes.saveAndFlush(note); // flush now so the version check (UPDATE ... WHERE version = ?) runs here
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.NOTE_SAVED, note.getCountryCode(), noteId.toString()));
        return toDto(note);
    }

    public void deleteNote(UUID userId, UUID noteId) {
        Note note = notes.findByIdAndUserId(noteId, userId).orElseThrow(() -> ApiException.notFound("Note", noteId));
        notes.delete(note);
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.NOTE_DELETED, note.getCountryCode(), noteId.toString()));
    }

    // ---- saved views -----------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ViewDto> views(UUID userId) {
        String owner = users.findById(userId).map(AppUser::getDisplayName).orElse(null);
        return views.findByUserIdOrderByCreatedAtDesc(userId).stream().map(v -> toDto(v, owner)).toList();
    }

    public ViewDto createView(UUID userId, ViewRequest req) {
        String slug;
        do {
            slug = slugs.next(8);
        } while (views.existsBySlug(slug));
        SavedView view = views.save(new SavedView(userId, slug, req.name().trim(), req.mode(), req.metric(), req.lat(),
                req.lng(), req.altitude(), req.selectedCountry() == null ? null : req.selectedCountry().toUpperCase(),
                req.isPublic()));
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.VIEW_SAVED, view.getSelectedCountry(), slug));
        return toDto(view, users.findById(userId).map(AppUser::getDisplayName).orElse(null));
    }

    public void deleteView(UUID userId, UUID viewId) {
        SavedView view = views.findById(viewId)
                .filter(v -> v.getUserId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("View", viewId));
        views.delete(view);
        events.publish(AtlasChanged.of(userId, AtlasChanged.Type.VIEW_DELETED, view.getSelectedCountry(), view.getSlug()));
    }

    /** Public views are visible to everybody, private ones only to their owner. */
    @Transactional(readOnly = true)
    public ViewDto viewBySlug(String slug, UUID callerId) {
        SavedView v = views.findBySlug(slug)
                .filter(x -> x.isPublic() || x.getUserId().equals(callerId))
                .orElseThrow(() -> ApiException.notFound("View", slug));
        return toDto(v, users.findById(v.getUserId()).map(AppUser::getDisplayName).orElse(null));
    }

    // ---- statistics ------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public AtlasStats stats(UUID userId) {
        List<TravelEntry> entries = travel.findByUserIdOrderByUpdatedAtDesc(userId);
        List<String> been = entries.stream()
                .filter(t -> t.getStatus() != TravelEntry.Status.WISHLIST)
                .map(TravelEntry::getCountryCode).toList();
        int wishlist = (int) entries.stream().filter(t -> t.getStatus() == TravelEntry.Status.WISHLIST).count();
        int lived = (int) entries.stream().filter(t -> t.getStatus() == TravelEntry.Status.LIVED).count();

        // progress per region: visited / total countries in that region
        Map<String, Long> totals = countries.all().stream()
                .collect(Collectors.groupingBy(Country::getRegion, TreeMap::new, Collectors.counting()));
        Map<String, Long> visitedPerRegion = been.stream()
                .flatMap(code -> countries.find(code).stream())
                .collect(Collectors.groupingBy(Country::getRegion, Collectors.counting()));
        Map<String, RegionProgress> byRegion = new TreeMap<>();
        totals.forEach((region, total) ->
                byRegion.put(region, new RegionProgress(visitedPerRegion.getOrDefault(region, 0L).intValue(), total.intValue())));

        int total = countries.all().size();
        double pct = total == 0 ? 0 : Math.round(1000.0 * been.size() / total) / 10.0;
        return new AtlasStats(been.size(), lived, wishlist, (int) favorites.countByUserId(userId),
                notes.countByUserId(userId), total, pct, byRegion, been);
    }

    @Transactional(readOnly = true)
    public CountryState countryState(UUID userId, String code) {
        String cc = country(code).getCode();
        UserCountryId id = new UserCountryId(userId, cc);
        TravelEntry.Status status = travel.findById(id).map(TravelEntry::getStatus).orElse(null);
        int noteCount = notes.findByUserIdAndCountryCodeOrderByUpdatedAtDesc(userId, cc).size();
        return new CountryState(cc, favorites.existsById(id), status, noteCount);
    }

    public Optional<Note> findNote(UUID noteId) {
        return notes.findById(noteId);
    }

    // ---- helpers ---------------------------------------------------------------------------------

    private Country country(String code) {
        return countries.find(code).orElseThrow(() -> ApiException.notFound("Country", code));
    }

    private NoteDto toDto(Note n) {
        String name = countries.find(n.getCountryCode()).map(Country::getName).orElse(n.getCountryCode());
        return new NoteDto(n.getId(), n.getCountryCode(), name, n.getTitle(), n.getBody(), n.getVersion(),
                n.getCreatedAt(), n.getUpdatedAt());
    }

    private static ViewDto toDto(SavedView v, String owner) {
        return new ViewDto(v.getId(), v.getSlug(), v.getName(), v.getMode(), v.getMetric(), v.getLat(), v.getLng(),
                v.getAltitude(), v.getSelectedCountry(), v.isPublic(), v.getCreatedAt(), owner);
    }
}
