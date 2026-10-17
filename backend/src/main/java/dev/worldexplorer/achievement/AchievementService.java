package dev.worldexplorer.achievement;

import dev.worldexplorer.common.events.AchievementUnlocked;
import dev.worldexplorer.common.events.AtlasChanged;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.IdempotencyGuard;
import dev.worldexplorer.common.events.MultiplayerFinished;
import dev.worldexplorer.common.events.QuizCompleted;
import dev.worldexplorer.common.events.Topics;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Badges and daily streaks – derived entirely from Kafka events (quiz completed, match finished, atlas
 * changed). No other module knows about achievements: they just announce what happened.
 *
 * <p>Each listener runs in one transaction together with the {@link IdempotencyGuard}, so a redelivered
 * event neither double-counts statistics nor unlocks twice. A newly unlocked badge is itself announced
 * as an event ({@code achievement.unlocked}, through the outbox) – the activity feed shows it and
 * {@link AchievementNotifier} pushes it to the player's browser.
 */
@Service
public class AchievementService {

    public record AchievementDto(String code, String title, String description, String icon, boolean unlocked,
            Instant unlockedAt) {}

    public record RegionKnowledge(String region, int countries, int total) {}

    public record Overview(List<AchievementDto> achievements, int unlocked, int currentStreak, int bestStreak,
            LocalDate lastDaily, List<RegionKnowledge> knowledge) {}

    private final JdbcClient jdbc;
    private final IdempotencyGuard guard;
    private final EventPublisher events;

    public AchievementService(JdbcClient jdbc, IdempotencyGuard guard, EventPublisher events) {
        this.jdbc = jdbc;
        this.guard = guard;
        this.events = events;
    }

    // ---- event handlers ----------------------------------------------------------------------------

    @Transactional
    @KafkaListener(id = "achievements-quiz", topics = Topics.QUIZ_COMPLETED, groupId = "achievements")
    public void onQuiz(QuizCompleted e) {
        if (e.userId() == null || !guard.firstTime("achievements", e.eventId())) return;
        UUID user = e.userId();
        for (QuizCompleted.Answer a : e.answers()) {
            if (a.countryCode() == null) continue;
            jdbc.sql("""
                            insert into player_country_stats (user_id, country_code, correct, wrong)
                            values (:u, :c, :ok, :bad)
                            on conflict (user_id, country_code) do update set
                                correct = player_country_stats.correct + excluded.correct,
                                wrong = player_country_stats.wrong + excluded.wrong
                            """)
                    .param("u", user).param("c", a.countryCode())
                    .param("ok", a.correct() ? 1 : 0).param("bad", a.correct() ? 0 : 1).update();
        }

        unlock(user, e.playerName(), Achievement.FIRST_QUIZ);
        if (e.total() >= 10 && e.correct() == e.total()) unlock(user, e.playerName(), Achievement.PERFECT_GAME);
        if (e.score() >= 12_000) unlock(user, e.playerName(), Achievement.SCORE_12K);

        if ("DAILY".equals(e.mode())) {
            int streak = updateStreak(user, e.occurredAt().atZone(ZoneOffset.UTC).toLocalDate());
            if (streak >= 3) unlock(user, e.playerName(), Achievement.STREAK_3);
            if (streak >= 7) unlock(user, e.playerName(), Achievement.STREAK_7);
            if (streak >= 30) unlock(user, e.playerName(), Achievement.STREAK_30);
        }

        int world = 0;
        for (RegionKnowledge k : knowledge(user)) {
            world += k.countries();
            Achievement badge = Achievement.forRegion(k.region());
            if (badge != null && k.countries() >= 10) unlock(user, e.playerName(), badge);
        }
        if (world >= 50) unlock(user, e.playerName(), Achievement.WORLD_50);
    }

    @Transactional
    @KafkaListener(id = "achievements-multiplayer", topics = Topics.MULTIPLAYER_FINISHED, groupId = "achievements")
    public void onMatch(MultiplayerFinished e) {
        if (!guard.firstTime("achievements", e.eventId())) return;
        for (MultiplayerFinished.Placement p : e.placements()) {
            if (p.placement() != 1) continue;
            long wins = jdbc.sql("select count(*) from multiplayer_participant where user_id = :u and placement = 1")
                    .param("u", p.userId()).query(Long.class).single();
            unlock(p.userId(), p.name(), Achievement.FIRST_WIN);
            if (wins >= 5) unlock(p.userId(), p.name(), Achievement.WINS_5);
        }
    }

    @Transactional
    @KafkaListener(id = "achievements-atlas", topics = Topics.ATLAS_CHANGED, groupId = "achievements")
    public void onAtlas(AtlasChanged e) {
        if (!guard.firstTime("achievements", e.eventId())) return;
        String name = jdbc.sql("select display_name from app_user where id = :u").param("u", e.userId())
                .query(String.class).optional().orElse("?");
        switch (e.type()) {
            case TRAVEL_UPDATED -> {
                long visited = jdbc.sql("""
                                select count(*) from travel_entry where user_id = :u and status in ('VISITED', 'LIVED')
                                """).param("u", e.userId()).query(Long.class).single();
                if (visited >= 10) unlock(e.userId(), name, Achievement.TRAVELER_10);
                if (visited >= 25) unlock(e.userId(), name, Achievement.GLOBETROTTER_25);
            }
            case NOTE_SAVED -> unlock(e.userId(), name, Achievement.FIRST_NOTE);
            case FAVORITE_ADDED -> {
                long favs = jdbc.sql("select count(*) from favorite where user_id = :u").param("u", e.userId())
                        .query(Long.class).single();
                if (favs >= 10) unlock(e.userId(), name, Achievement.COLLECTOR_10);
            }
            default -> {}
        }
    }

    // ---- queries -----------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Overview overview(UUID user) {
        Map<String, Instant> unlocked = new LinkedHashMap<>();
        jdbc.sql("select code, unlocked_at from achievement where user_id = :u").param("u", user)
                .query((rs, i) -> unlocked.put(rs.getString("code"), rs.getTimestamp("unlocked_at").toInstant()))
                .list();
        List<AchievementDto> all = Arrays.stream(Achievement.values())
                .map(a -> new AchievementDto(a.name(), a.title(), a.description(), a.icon(), unlocked.containsKey(a.name()),
                        unlocked.get(a.name())))
                .toList();
        record Streak(int current, int best, LocalDate last) {}
        Streak streak = jdbc.sql("select current_streak, best_streak, last_played from user_streak where user_id = :u")
                .param("u", user)
                .query((rs, i) -> new Streak(rs.getInt(1), rs.getInt(2),
                        rs.getDate(3) == null ? null : rs.getDate(3).toLocalDate()))
                .optional().orElse(new Streak(0, 0, null));
        // a streak is only "current" if the last daily was today or yesterday
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int current = streak.last() != null && !streak.last().isBefore(today.minusDays(1)) ? streak.current() : 0;
        return new Overview(all, unlocked.size(), current, streak.best(), streak.last(), knowledge(user));
    }

    /** Distinct countries per region the player answered correctly at least once. */
    List<RegionKnowledge> knowledge(UUID user) {
        List<RegionKnowledge> out = new ArrayList<>();
        jdbc.sql("""
                        select c.region,
                               count(distinct s.country_code) filter (where s.correct > 0) as known,
                               (select count(*) from country c2 where c2.region = c.region and c2.un_member) as total
                        from country c left join player_country_stats s on s.country_code = c.code and s.user_id = :u
                        where c.region <> 'Antarctic'
                        group by c.region order by c.region
                        """)
                .param("u", user)
                .query((rs, i) -> out.add(new RegionKnowledge(rs.getString(1), rs.getInt(2), rs.getInt(3))))
                .list();
        return out;
    }

    // ---- helpers -----------------------------------------------------------------------------------

    /** Inserts the badge if new; announces it only the first time. */
    void unlock(UUID user, String name, Achievement a) {
        int inserted = jdbc.sql("""
                        insert into achievement (user_id, code) values (:u, :c) on conflict do nothing
                        """)
                .param("u", user).param("c", a.name()).update();
        if (inserted == 1) events.publish(AchievementUnlocked.of(user, name, a.name(), a.title()));
    }

    /** Daily streak: yesterday → +1, today again → unchanged, gap → back to 1. Returns the current streak. */
    int updateStreak(UUID user, LocalDate day) {
        return jdbc.sql("""
                        insert into user_streak (user_id, current_streak, best_streak, last_played)
                        values (:u, 1, 1, :d)
                        on conflict (user_id) do update set
                            current_streak = case
                                when user_streak.last_played = :d then user_streak.current_streak
                                when user_streak.last_played = :d - 1 then user_streak.current_streak + 1
                                else 1 end,
                            best_streak = greatest(user_streak.best_streak, case
                                when user_streak.last_played = :d - 1 then user_streak.current_streak + 1
                                else 1 end),
                            last_played = :d
                        returning current_streak
                        """)
                .param("u", user).param("d", day)
                .query(Integer.class).single();
    }
}
