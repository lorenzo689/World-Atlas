package dev.worldexplorer.quiz;

import dev.worldexplorer.atlas.SlugGenerator;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.security.AuthUser;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates quiz duels and shows their results. Playing one goes through {@link QuizService#start}. */
@Service
public class ChallengeService {

    private static final SecureRandom RANDOM = new SecureRandom();

    public record ChallengeResult(int rank, UUID userId, String name, int score, int correct, int total,
            long durationMs, Instant finishedAt) {}

    public record ChallengeView(String slug, String creatorName, String region, int rounds, Instant createdAt,
            List<ChallengeResult> results, boolean played) {}

    private final QuizChallengeRepository challenges;
    private final SlugGenerator slugs;
    private final JdbcClient jdbc;

    public ChallengeService(QuizChallengeRepository challenges, SlugGenerator slugs, JdbcClient jdbc) {
        this.challenges = challenges;
        this.slugs = slugs;
        this.jdbc = jdbc;
    }

    @Transactional
    public ChallengeView create(AuthUser user, String region, Integer rounds) {
        String slug;
        do {
            slug = slugs.next(7);
        } while (challenges.existsBySlug(slug));
        QuizChallenge c = challenges.save(new QuizChallenge(slug, user.id(), user.name(), RANDOM.nextLong(),
                region == null || region.isBlank() ? null : region,
                rounds == null ? 10 : Math.max(5, Math.min(rounds, 20))));
        return view(c, user.id());
    }

    @Transactional(readOnly = true)
    public ChallengeView get(String slug, UUID viewer) {
        return view(find(slug), viewer);
    }

    public QuizChallenge find(String slug) {
        return challenges.findBySlug(slug).orElseThrow(() -> ApiException.notFound("Challenge", slug));
    }

    public String slugOf(UUID id) {
        return challenges.findById(id).map(QuizChallenge::getSlug).orElse(null);
    }

    /** Ranking of everybody who played the duel: score first, then speed. */
    private ChallengeView view(QuizChallenge c, UUID viewer) {
        List<ChallengeResult> results = jdbc.sql("""
                        select user_id, player_name, score, correct, total, duration_ms, finished_at,
                               rank() over (order by score desc, duration_ms asc) as rnk
                        from quiz_result where challenge_id = :id
                        order by rnk limit 50
                        """)
                .param("id", c.getId())
                .query((rs, i) -> new ChallengeResult(rs.getInt("rnk"), rs.getObject("user_id", UUID.class),
                        rs.getString("player_name"), rs.getInt("score"), rs.getInt("correct"), rs.getInt("total"),
                        rs.getLong("duration_ms"), rs.getTimestamp("finished_at").toInstant()))
                .list();
        boolean played = viewer != null && results.stream().anyMatch(r -> viewer.equals(r.userId()));
        return new ChallengeView(c.getSlug(), c.getCreatorName(), c.getRegion(), c.getRounds(), c.getCreatedAt(),
                results, played);
    }
}
