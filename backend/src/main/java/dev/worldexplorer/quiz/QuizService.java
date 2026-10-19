package dev.worldexplorer.quiz;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.QuizCompleted;
import dev.worldexplorer.common.redis.RedisJson;
import dev.worldexplorer.common.redis.RedisLock;
import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.quiz.QuizDtos.AnswerRequest;
import dev.worldexplorer.quiz.QuizDtos.AnswerResult;
import dev.worldexplorer.quiz.QuizDtos.QuestionView;
import dev.worldexplorer.quiz.QuizDtos.ReviewItem;
import dev.worldexplorer.quiz.QuizDtos.StartRequest;
import dev.worldexplorer.quiz.QuizDtos.StartResponse;
import dev.worldexplorer.quiz.QuizDtos.Summary;
import dev.worldexplorer.quiz.QuizSession.AnswerRecord;
import dev.worldexplorer.quiz.engine.AnswerChecker;
import dev.worldexplorer.quiz.engine.FlagStore;
import dev.worldexplorer.quiz.engine.Question;
import dev.worldexplorer.quiz.engine.QuestionType;
import dev.worldexplorer.quiz.engine.Scoring;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Single-player quiz.
 *
 * <p>The server is authoritative: it creates the questions, keeps the answers secret, starts the clock
 * when a question is <em>served</em> and scores on its own clock. A client can't peek at answers or
 * fake fast times.
 */
@Service
public class QuizService {

    private static final List<QuestionType> ALL_TYPES = List.of(QuestionType.values());
    private static final Duration GRACE = Duration.ofSeconds(1); // network latency allowance

    private final QuestionFactory questions;
    private final AnswerChecker checker;
    private final RedisJson store;
    private final RedisLock lock;
    private final StringRedisTemplate redis;
    private final LeaderboardService leaderboards;
    private final QuizResultRepository results;
    private final EventPublisher events;
    private final FlagStore flags;
    private final MeterRegistry meters;
    private final AppProperties.Quiz config;
    private final ChallengeService challenges;
    private final LearningService learning;

    public QuizService(QuestionFactory questions, AnswerChecker checker, RedisJson store, RedisLock lock,
            StringRedisTemplate redis, LeaderboardService leaderboards, QuizResultRepository results,
            EventPublisher events, FlagStore flags, MeterRegistry meters, AppProperties props,
            ChallengeService challenges, LearningService learning) {
        this.challenges = challenges;
        this.learning = learning;
        this.questions = questions;
        this.checker = checker;
        this.store = store;
        this.lock = lock;
        this.redis = redis;
        this.leaderboards = leaderboards;
        this.results = results;
        this.events = events;
        this.flags = flags;
        this.meters = meters;
        this.config = props.quiz();
    }

    public StartResponse start(AuthUser user, StartRequest req) {
        List<Question> qs;
        boolean ranked;
        String dailyDate = null;
        UUID challengeId = null;
        String region = req.region() == null || req.region().isBlank() ? null : req.region().trim();

        if (req.mode() == QuizMode.REVIEW) {
            qs = questions.review(learning.dueTargets(user.id(), 10));
            if (qs.isEmpty()) throw ApiException.conflict("nothing_due", "No review questions are due yet.");
            ranked = false;
            region = null;
        } else if (req.mode() == QuizMode.CHALLENGE) {
            if (req.challenge() == null) throw ApiException.badRequest("missing_challenge", "Which duel do you want to play?");
            QuizChallenge c = challenges.find(req.challenge());
            // one attempt per player and duel
            Boolean first = redis.opsForValue().setIfAbsent("quiz:challenge:" + c.getId() + ":" + user.id(), "1",
                    Duration.ofDays(365));
            if (!Boolean.TRUE.equals(first)) {
                throw ApiException.conflict("challenge_played", "You already played this duel.");
            }
            qs = questions.seeded(ALL_TYPES, c.getRegion(), c.getRounds(), c.getSeed());
            ranked = false;
            region = c.getRegion();
            challengeId = c.getId();
        } else if (req.mode() == QuizMode.DAILY) {
            LocalDate today = LocalDate.now(ZoneOffset.UTC);
            dailyDate = today.toString();
            // one attempt per player and day: SET NX succeeds only the first time
            Boolean first = redis.opsForValue().setIfAbsent("quiz:daily:" + today + ":" + user.id(), "1", Duration.ofDays(2));
            if (!Boolean.TRUE.equals(first)) {
                throw ApiException.conflict("daily_played", "You already played today's challenge. Come back tomorrow!");
            }
            qs = questions.seeded(ALL_TYPES, null, 10, today.toEpochDay() * 7919L);
            ranked = true;
            region = null;
        } else {
            int rounds = req.rounds() == null ? config.defaultRounds() : req.rounds();
            List<QuestionType> types = req.types() == null || req.types().isEmpty() ? ALL_TYPES : req.types();
            try {
                qs = questions.random(types, region, rounds);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("invalid_region", e.getMessage());
            }
            ranked = region == null && rounds == 10 && types.size() == ALL_TYPES.size();
        }

        QuizSession session = new QuizSession(UUID.randomUUID(), user.id(), user.name(), req.mode(), region, dailyDate,
                ranked, qs, 0, null, List.of(), 0, Instant.now(), null, challengeId);
        save(session);
        return new StartResponse(session.id(), session.mode(), qs.size(), ranked, region);
    }

    /** Serves the current question and starts its clock (idempotent: asking again keeps the first time). */
    public QuestionView currentQuestion(AuthUser user, UUID id) {
        return lock.withLock("quiz:" + id, Duration.ofSeconds(5), Duration.ofSeconds(3), () -> {
            QuizSession s = load(user, id);
            if (s.finished()) throw ApiException.conflict("quiz_finished", "This quiz is finished.");
            if (s.servedAt() == null) {
                s = s.serve(Instant.now());
                save(s);
            }
            Question q = s.currentQuestion();
            return new QuestionView(q.toPublic(s.questions().size()), s.servedAt(),
                    s.servedAt().plus(q.type().timeLimit()), s.score());
        });
    }

    public AnswerResult answer(AuthUser user, UUID id, AnswerRequest req) {
        // serialise answers per session: a double click must not be counted twice
        return lock.withLock("quiz:" + id, Duration.ofSeconds(5), Duration.ofSeconds(3), () -> {
            QuizSession s = load(user, id);
            if (s.finished()) throw ApiException.conflict("quiz_finished", "This quiz is finished.");
            if (req.index() != s.current()) {
                throw ApiException.conflict("wrong_question", "Question " + req.index() + " is not the current one.");
            }
            if (s.servedAt() == null) throw ApiException.conflict("not_served", "Fetch the question first.");

            Question q = s.currentQuestion();
            Instant now = Instant.now();
            Duration elapsed = Duration.between(s.servedAt(), now).minus(GRACE);
            if (elapsed.isNegative()) elapsed = Duration.ZERO;
            Scoring.Result r = checker.check(q, req.answer(), elapsed);
            meters.counter("quiz.answers", "type", q.type().name(), "correct", String.valueOf(r.correct())).increment();

            AnswerRecord record = new AnswerRecord(q.index(), req.answer(), r.correct(), r.points(), r.distanceKm(),
                    elapsed.toMillis(), r.late());
            QuizSession next = s.answer(record, now);
            save(next);
            if (next.finished()) complete(next);
            return new AnswerResult(r.correct(), r.late(), r.points(), next.score(), q.answer(), checker.correctLabel(q),
                    q.answerCountry(), r.distanceKm(), next.finished(), next.finished() ? null : next.current());
        });
    }

    @Transactional(readOnly = true)
    public Summary summary(AuthUser user, UUID id) {
        QuizSession s = load(user, id);
        if (!s.finished()) throw ApiException.conflict("quiz_running", "The quiz is still running.");
        List<ReviewItem> review = new ArrayList<>();
        for (AnswerRecord a : s.answers()) {
            Question q = s.questions().get(a.index());
            review.add(new ReviewItem(q.index(), q.type(), q.prompt(), q.target(), a.answer(), q.answer(),
                    checker.correctLabel(q), q.answerCountry(), a.correct(), a.points(), a.distanceKm(), a.elapsedMs()));
        }
        boolean daily = s.mode() == QuizMode.DAILY;
        return new Summary(s.id(), s.mode(), s.region(), s.ranked(), s.score(), s.correctCount(), s.questions().size(),
                Duration.between(s.startedAt(), s.finishedAt()).toMillis(),
                s.ranked() && !daily ? leaderboards.rank(LeaderboardService.Period.WEEKLY, s.userId()) : null,
                s.ranked() && !daily ? leaderboards.rank(LeaderboardService.Period.ALLTIME, s.userId()) : null,
                daily ? leaderboards.rank(LeaderboardService.Period.DAILY, s.userId()) : null,
                s.challengeId() == null ? null : challenges.slugOf(s.challengeId()),
                review);
    }

    /** Flag image of a FLAG question that has already been served. */
    public byte[] flag(AuthUser user, UUID id, int index) {
        QuizSession s = load(user, id);
        if (index < 0 || index > s.current() || index >= s.questions().size()) throw ApiException.notFound("Question", index);
        Question q = s.questions().get(index);
        if (q.type() != QuestionType.FLAG) throw ApiException.badRequest("no_flag", "This question has no flag.");
        return flags.svg(q.target()).orElseThrow(() -> ApiException.notFound("Flag", index));
    }

    /** Persists the result, updates leaderboards and announces the event (consumed by statistics + activity). */
    private void complete(QuizSession s) {
        long duration = Duration.between(s.startedAt(), s.finishedAt()).toMillis();
        results.save(new QuizResult(s.id(), s.userId(), s.playerName(), s.mode(), s.region(), s.score(),
                s.correctCount(), s.questions().size(), duration, s.finishedAt(), s.challengeId()));
        if (s.ranked()) {
            leaderboards.recordGame(s.userId(), s.playerName(), s.score(), s.mode() == QuizMode.DAILY,
                    s.dailyDate() == null ? null : LocalDate.parse(s.dailyDate()));
        }
        List<QuizCompleted.Answer> answers = s.answers().stream().map(a -> {
            Question q = s.questions().get(a.index());
            return new QuizCompleted.Answer(q.type().name(), q.target(), a.correct(), a.points());
        }).toList();
        events.publish(new QuizCompleted(UUID.randomUUID().toString(), s.finishedAt(), s.id(), s.userId(),
                s.playerName(), s.mode().name(), s.region(), s.score(), s.correctCount(), s.questions().size(), duration,
                answers));
    }

    private QuizSession load(AuthUser user, UUID id) {
        QuizSession s = store.get(key(id), QuizSession.class)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "quiz_not_found", "Quiz not found or expired."));
        if (!s.userId().equals(user.id())) throw ApiException.forbidden("This is not your quiz.");
        return s;
    }

    private void save(QuizSession s) {
        store.set(key(s.id()), s, config.sessionTtl());
    }

    private static String key(UUID id) {
        return "quiz:session:" + id;
    }
}
