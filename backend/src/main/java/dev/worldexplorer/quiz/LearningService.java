package dev.worldexplorer.quiz;

import dev.worldexplorer.common.events.IdempotencyGuard;
import dev.worldexplorer.common.events.QuizCompleted;
import dev.worldexplorer.common.events.Topics;
import dev.worldexplorer.quiz.engine.QuestionGenerator;
import dev.worldexplorer.quiz.engine.QuestionType;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Spaced practice derived from authoritative quiz outcomes, never from client-submitted scores. */
@Service
public class LearningService {
    public record Item(String countryCode, QuestionType type, int correct, int wrong, int repetitions,
            int intervalDays, Instant dueAt) {}
    public record Overview(int learned, int due, List<Item> next) {}
    record Schedule(int repetitions, int intervalDays, double ease, Instant dueAt) {}

    private final JdbcClient jdbc;
    private final IdempotencyGuard guard;

    public LearningService(JdbcClient jdbc, IdempotencyGuard guard) {
        this.jdbc = jdbc;
        this.guard = guard;
    }

    @Transactional
    @KafkaListener(id = "learning-quiz", topics = Topics.QUIZ_COMPLETED, groupId = "learning")
    public void onQuiz(QuizCompleted event) {
        if (event.userId() == null || !guard.firstTime("learning", event.eventId())) return;
        for (QuizCompleted.Answer answer : event.answers()) {
            if (answer.countryCode() == null) continue;
            QuestionType type = QuestionType.valueOf(answer.type());
            var prior = jdbc.sql("""
                    select repetitions, interval_days, ease from learning_progress
                    where user_id=:user and question_type=:type and country_code=:country
                    """).param("user", event.userId()).param("type", type.name())
                    .param("country", answer.countryCode())
                    .query((rs, n) -> new double[] {rs.getInt(1), rs.getInt(2), rs.getDouble(3)})
                    .optional().orElse(new double[] {0, 0, 2.5});
            Schedule next = schedule((int) prior[0], (int) prior[1], prior[2], answer.correct(), event.occurredAt());
            jdbc.sql("""
                    insert into learning_progress(user_id, question_type, country_code, correct, wrong,
                        repetitions, interval_days, ease, due_at, last_answered_at)
                    values(:user,:type,:country,:correct,:wrong,:repetitions,:interval,:ease,:due,:answered)
                    on conflict(user_id, question_type, country_code) do update set
                        correct=learning_progress.correct+excluded.correct,
                        wrong=learning_progress.wrong+excluded.wrong,
                        repetitions=excluded.repetitions, interval_days=excluded.interval_days,
                        ease=excluded.ease, due_at=excluded.due_at, last_answered_at=excluded.last_answered_at
                    """).param("user", event.userId()).param("type", type.name())
                    .param("country", answer.countryCode()).param("correct", answer.correct() ? 1 : 0)
                    .param("wrong", answer.correct() ? 0 : 1).param("repetitions", next.repetitions())
                    .param("interval", next.intervalDays()).param("ease", next.ease())
                    .param("due", Timestamp.from(next.dueAt()))
                    .param("answered", Timestamp.from(event.occurredAt())).update();
        }
    }

    static Schedule schedule(int repetitions, int previousInterval, double previousEase, boolean correct, Instant now) {
        double ease = Math.max(1.3, Math.min(3.0, previousEase + (correct ? 0.1 : -0.2)));
        int nextRepetitions = correct ? repetitions + 1 : 0;
        int days = !correct ? 0 : nextRepetitions == 1 ? 1 : nextRepetitions == 2 ? 3
                : Math.min(365, Math.max(4, (int) Math.round(previousInterval * ease)));
        return new Schedule(nextRepetitions, days, ease, now.plus(days, ChronoUnit.DAYS));
    }

    public List<QuestionGenerator.Target> dueTargets(UUID user, int limit) {
        return jdbc.sql("""
                select question_type, country_code from learning_progress
                where user_id=:user and due_at <= now()
                order by due_at, wrong desc limit :limit
                """).param("user", user).param("limit", limit)
                .query((rs, n) -> new QuestionGenerator.Target(QuestionType.valueOf(rs.getString(1)), rs.getString(2)))
                .list();
    }

    public Overview overview(UUID user) {
        long[] counts = jdbc.sql("""
                select count(*), count(*) filter (where due_at <= now())
                from learning_progress where user_id=:user
                """).param("user", user)
                .query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
        List<Item> items = jdbc.sql("""
                select country_code, question_type, correct, wrong, repetitions, interval_days, due_at
                from learning_progress where user_id=:user order by due_at limit 10
                """).param("user", user).query((rs, n) -> new Item(rs.getString(1),
                QuestionType.valueOf(rs.getString(2)), rs.getInt(3), rs.getInt(4), rs.getInt(5),
                rs.getInt(6), rs.getTimestamp(7).toInstant())).list();
        return new Overview(Math.toIntExact(counts[0]), Math.toIntExact(counts[1]), items);
    }
}
