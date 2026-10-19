package dev.worldexplorer.conflict;

import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.conflict.ConflictDtos.Brief;
import dev.worldexplorer.conflict.ConflictDtos.Dataset;
import dev.worldexplorer.conflict.ConflictDtos.Localized;
import dev.worldexplorer.conflict.ConflictDtos.Revision;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** Immutable published snapshots with a draft/review boundary and daily source checks. */
@Service
public class ConflictService {
    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    public ConflictService(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() throws IOException {
        try (var in = new ClassPathResource("data/conflicts.json").getInputStream()) {
            Dataset data = json.readValue(in, Dataset.class);
            if (data.schemaVersion() != 1) throw new IllegalStateException("Unsupported conflict seed schema");
            for (Brief brief : data.briefs()) {
                validate(brief);
                jdbc.sql("""
                        insert into conflict_revision(id,brief_id,version,content,source_date,source_url,
                            created_at,published_at) values(:id,:brief,:version,cast(:content as jsonb),
                            :date,:url,:published,:published) on conflict(brief_id,version) do nothing
                        """).param("id", UUID.randomUUID()).param("brief", brief.id())
                        .param("version", brief.revision()).param("content", json.writeValueAsString(brief))
                        .param("date", LocalDate.parse(brief.sourceDate())).param("url", brief.sourceUrl())
                        .param("published", Instant.parse(brief.reviewedAt() + "T00:00:00Z")).update();
            }
        }
    }

    public List<Brief> published() {
        return jdbc.sql("""
                select distinct on (brief_id) content from conflict_revision
                where published_at is not null order by brief_id,version desc
                """).query((rs, n) -> json.readValue(rs.getString(1), Brief.class)).list();
    }

    public List<Revision> history(String briefId) {
        return jdbc.sql("""
                select id,brief_id,version,content,created_at,published_at,source_checked_at,source_check_status
                from conflict_revision where brief_id=:brief and published_at is not null
                order by version desc limit 50
                """).param("brief", briefId).query(this::revision).list();
    }

    public List<Revision> editorialQueue() {
        return jdbc.sql("""
                select id,brief_id,version,content,created_at,published_at,source_checked_at,source_check_status
                from conflict_revision where published_at is null
                or (published_at is not null and version = (select max(version) from conflict_revision c
                    where c.brief_id=conflict_revision.brief_id and c.published_at is not null))
                order by brief_id,version desc limit 100
                """).query(this::revision).list();
    }

    @Transactional
    public Revision draft(Brief candidate, UUID editor) {
        validate(candidate);
        jdbc.sql("select pg_advisory_xact_lock(hashtext(:brief))").param("brief", candidate.id())
                .query(Long.class).single();
        int version = jdbc.sql("select coalesce(max(version),0)+1 from conflict_revision where brief_id=:brief")
                .param("brief", candidate.id()).query(Integer.class).single();
        Brief brief = withRevision(candidate, version, LocalDate.now().toString());
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into conflict_revision(id,brief_id,version,content,source_date,source_url,editor_id)
                values(:id,:brief,:version,cast(:content as jsonb),:date,:url,:editor)
                """).param("id", id).param("brief", brief.id()).param("version", version)
                .param("content", json.writeValueAsString(brief)).param("date", LocalDate.parse(brief.sourceDate()))
                .param("url", brief.sourceUrl()).param("editor", editor).update();
        return get(id);
    }

    @Transactional
    public Revision publish(UUID id) {
        Revision draft = get(id);
        if (draft.publishedAt() != null) throw ApiException.conflict("already_published", "Revision is already published.");
        int latest = jdbc.sql("""
                select coalesce(max(version),0) from conflict_revision
                where brief_id=:brief and published_at is not null
                """).param("brief", draft.briefId()).query(Integer.class).single();
        if (latest >= draft.version()) throw ApiException.conflict("stale_revision", "A newer revision is already published.");
        jdbc.sql("update conflict_revision set published_at=now() where id=:id and published_at is null")
                .param("id", id).update();
        return get(id);
    }

    public Revision get(UUID id) {
        return jdbc.sql("""
                select id,brief_id,version,content,created_at,published_at,source_checked_at,source_check_status
                from conflict_revision where id=:id
                """).param("id", id).query(this::revision).optional()
                .orElseThrow(() -> ApiException.notFound("Conflict revision", id));
    }

    @Scheduled(cron = "0 0 5 * * *")
    public void checkSources() {
        for (Revision revision : editorialQueue()) {
            if (revision.publishedAt() == null) continue;
            String result = checkSource(revision.brief());
            jdbc.sql("update conflict_revision set source_checked_at=now(),source_check_status=:status where id=:id")
                    .param("status", result).param("id", revision.id()).update();
        }
    }

    private String checkSource(Brief brief) {
        if (LocalDate.parse(brief.sourceDate()).isBefore(LocalDate.now().minusDays(60))) return "STALE";
        try {
            URI uri = URI.create(brief.sourceUrl());
            if (!approvedSource(uri)) return "UNVERIFIED";
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody()).build();
            int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            return status >= 200 && status < 400 ? "OK" : "UNREACHABLE";
        } catch (Exception e) {
            return "UNREACHABLE";
        }
    }

    private Revision revision(ResultSet rs, int n) throws SQLException {
        return new Revision(rs.getObject("id", UUID.class), rs.getString("brief_id"), rs.getInt("version"),
                json.readValue(rs.getString("content"), Brief.class), rs.getTimestamp("created_at").toInstant(),
                instant(rs, "published_at"), instant(rs, "source_checked_at"), rs.getString("source_check_status"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static Brief withRevision(Brief b, int revision, String reviewedAt) {
        return new Brief(b.id(), b.countryCodes(), b.title(), b.region(), b.status(), b.location(),
                b.locationPrecision(), b.sourceDate(), b.sourceName(), b.sourceUrl(), reviewedAt, revision,
                b.summary(), b.context(), b.question(), b.answer());
    }

    private static void validate(Brief b) {
        if (b == null || b.id() == null || !b.id().matches("[a-z0-9-]{2,60}")
                || b.countryCodes() == null || b.countryCodes().isEmpty() || b.countryCodes().size() > 5
                || b.countryCodes().stream().anyMatch(code -> !code.matches("[A-Z]{3}"))
                || !filled(b.title()) || !filled(b.region()) || !filled(b.summary()) || !filled(b.context())
                || !filled(b.question()) || !filled(b.answer()) || b.location() == null
                || !Double.isFinite(b.location().lat()) || !Double.isFinite(b.location().lng())
                || Math.abs(b.location().lat()) > 90 || Math.abs(b.location().lng()) > 180
                || !"regional".equals(b.locationPrecision())
                || !("active".equals(b.status()) || "fragile-ceasefire".equals(b.status()))
                || b.sourceName() == null || b.sourceName().isBlank() || b.sourceName().length() > 160
                || b.sourceUrl() == null || b.sourceUrl().length() > 1000) {
            throw ApiException.badRequest("invalid_conflict_brief", "Conflict brief is incomplete or invalid.");
        }
        try {
            if (!approvedSource(URI.create(b.sourceUrl())))
                throw ApiException.badRequest("invalid_source_url", "Use an approved HTTPS source.");
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_source_url", "Use an approved HTTPS source.");
        }
        try {
            LocalDate sourceDate = LocalDate.parse(b.sourceDate());
            if (sourceDate.isAfter(LocalDate.now()) || sourceDate.isBefore(LocalDate.now().minusYears(2)))
                throw ApiException.badRequest("invalid_source_date", "Use a recent source date.");
        } catch (RuntimeException e) {
            if (e instanceof ApiException) throw e;
            throw ApiException.badRequest("invalid_source_date", "Use an ISO source date.");
        }
    }

    private static boolean filled(Localized value) {
        return value != null && value.de() != null && !value.de().isBlank() && value.de().length() <= 2000
                && value.en() != null && !value.en().isBlank() && value.en().length() <= 2000;
    }

    private static boolean approvedSource(URI uri) {
        String host = uri.getHost();
        return "https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null
                && uri.getPort() == -1 && host != null
                && (host.equals("un.org") || host.endsWith(".un.org")
                    || host.equals("ochaopt.org") || host.endsWith(".ochaopt.org")
                    || host.equals("unhcr.org") || host.endsWith(".unhcr.org")
                    || host.equals("acleddata.com") || host.endsWith(".acleddata.com"));
    }
}
