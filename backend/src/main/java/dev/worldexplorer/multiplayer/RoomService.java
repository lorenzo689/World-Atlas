package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.events.EventPublisher;
import dev.worldexplorer.common.events.MultiplayerFinished;
import dev.worldexplorer.common.redis.RedisJson;
import dev.worldexplorer.common.redis.RedisLock;
import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.multiplayer.Room.Player;
import dev.worldexplorer.multiplayer.Room.RoundAnswer;
import dev.worldexplorer.multiplayer.RoomDtos.ChatEvent;
import dev.worldexplorer.multiplayer.RoomDtos.CreateRoomRequest;
import dev.worldexplorer.multiplayer.RoomDtos.GameFinished;
import dev.worldexplorer.multiplayer.RoomDtos.OpenRoom;
import dev.worldexplorer.multiplayer.RoomDtos.Placement;
import dev.worldexplorer.multiplayer.RoomDtos.PlayerResult;
import dev.worldexplorer.multiplayer.RoomDtos.PlayerView;
import dev.worldexplorer.multiplayer.RoomDtos.RoomView;
import dev.worldexplorer.multiplayer.RoomDtos.RoundEnded;
import dev.worldexplorer.multiplayer.RoomDtos.RoundStarted;
import dev.worldexplorer.quiz.QuestionFactory;
import dev.worldexplorer.quiz.engine.AnswerChecker;
import dev.worldexplorer.quiz.engine.FlagStore;
import dev.worldexplorer.quiz.engine.Question;
import dev.worldexplorer.quiz.engine.QuestionType;
import dev.worldexplorer.quiz.engine.Scoring;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The multiplayer game – an authoritative server-side state machine.
 *
 * <p>Every change follows the same pattern: <b>lock → load → validate → mutate → save → unlock →
 * broadcast</b> ({@link #mutate}). The Redis lock guarantees that concurrent answers, a round timer and
 * a "leave" never interleave. Broadcasts go through {@link RoomBroadcaster} (Redis pub/sub → WebSocket).
 *
 * <p>Round timing uses Spring's {@link TaskScheduler}: when a round starts, its end is scheduled; when it
 * ends, the next round is scheduled. Timers are idempotent (they check round number and game counter),
 * so a round that already ended early – because everybody answered – is not ended twice.
 * Limitation: timers live in the instance that started the game.
 */
@Service
public class RoomService {

    private static final Logger log = LoggerFactory.getLogger(RoomService.class);
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String OPEN_ROOMS = "rooms:open";
    private static final Duration GRACE = Duration.ofMillis(800);
    private static final List<QuestionType> DEFAULT_TYPES =
            List.of(QuestionType.LOCATE, QuestionType.CAPITAL, QuestionType.FLAG, QuestionType.POPULATION);

    private final RedisJson store;
    private final RedisLock lock;
    private final StringRedisTemplate redis;
    private final RoomBroadcaster broadcast;
    private final QuestionFactory questions;
    private final AnswerChecker checker;
    private final FlagStore flags;
    private final TaskScheduler scheduler;
    private final EventPublisher events;
    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final AppProperties.Multiplayer config;

    public RoomService(RedisJson store, RedisLock lock, StringRedisTemplate redis, RoomBroadcaster broadcast,
            QuestionFactory questions, AnswerChecker checker, FlagStore flags, TaskScheduler scheduler,
            EventPublisher events, JdbcClient jdbc, TransactionTemplate tx, AppProperties props) {
        this.store = store;
        this.lock = lock;
        this.redis = redis;
        this.broadcast = broadcast;
        this.questions = questions;
        this.checker = checker;
        this.flags = flags;
        this.scheduler = scheduler;
        this.events = events;
        this.jdbc = jdbc;
        this.tx = tx;
        this.config = props.multiplayer();
    }

    // ================================================================================== lobby ====

    public RoomView create(AuthUser user, CreateRoomRequest req, boolean matchmade) {
        leaveCurrentRoom(user);
        Room.Settings settings = new Room.Settings(
                req.rounds() == null ? 8 : req.rounds(),
                req.types() == null || req.types().isEmpty() ? DEFAULT_TYPES : req.types(),
                req.region() == null || req.region().isBlank() ? null : req.region(),
                req.roundSeconds() == null ? (int) config.roundDuration().toSeconds() : req.roundSeconds());
        String code = newCode();
        Room room = new Room(code, user.id(), settings, req.isPublic() && !matchmade);
        room.matchmade = matchmade;
        room.players.put(user.id().toString(), new Player(user.id(), user.name()));
        save(room);
        redis.opsForValue().set(userRoomKey(user.id()), code, config.roomTtl());
        if (room.isPublic) redis.opsForSet().add(OPEN_ROOMS, code);
        return view(room);
    }

    public RoomView join(String code, AuthUser user) {
        Room room = mutate(code, r -> {
            if (r.has(user.id())) {
                r.player(user.id()).connected = true; // rejoin after reconnect
                return r;
            }
            if (r.status != Room.Status.LOBBY) throw ApiException.conflict("game_running", "The game has already started.");
            if (r.players.size() >= config.maxPlayers()) throw ApiException.conflict("room_full", "The room is full.");
            r.players.put(user.id().toString(), new Player(user.id(), user.name()));
            return r;
        });
        redis.opsForValue().set(userRoomKey(user.id()), code, config.roomTtl());
        broadcast.toRoom(code, "PLAYER_JOINED", playerView(room, room.player(user.id())));
        broadcast.toRoom(code, "ROOM_STATE", view(room));
        return view(room);
    }

    public void leave(String code, AuthUser user) {
        Room room = mutate(code, r -> {
            if (!r.has(user.id())) return r;
            if (r.status == Room.Status.RUNNING) {
                r.player(user.id()).connected = false; // keep the score, the game goes on
            } else {
                r.players.remove(user.id().toString());
                if (user.id().equals(r.hostId) && !r.players.isEmpty()) {
                    r.hostId = r.players.values().iterator().next().id; // hand over hosting
                }
            }
            return r;
        });
        redis.delete(userRoomKey(user.id()));
        if (room.players.isEmpty()) {
            store.delete(roomKey(code));
            redis.opsForSet().remove(OPEN_ROOMS, code);
            return;
        }
        broadcast.toRoom(code, "PLAYER_LEFT", user.id());
        broadcast.toRoom(code, "ROOM_STATE", view(room));
        if (room.status == Room.Status.RUNNING) maybeEndRoundEarly(room);
    }

    /** Called when a WebSocket session closes: same as leaving, but only marks the player offline in games. */
    public void disconnected(UUID userId) {
        String code = redis.opsForValue().get(userRoomKey(userId));
        if (code == null) return;
        try {
            Room room = mutate(code, r -> {
                Player p = r.player(userId);
                if (p != null) p.connected = false;
                return r;
            });
            broadcast.toRoom(code, "ROOM_STATE", view(room));
            if (room.status == Room.Status.RUNNING) maybeEndRoundEarly(room);
        } catch (ApiException ignored) {
            // room is gone
        }
    }

    public RoomView get(String code) {
        return view(load(code));
    }

    public List<OpenRoom> openRooms() {
        Set<String> codes = redis.opsForSet().members(OPEN_ROOMS);
        if (codes == null) return List.of();
        List<OpenRoom> out = new ArrayList<>();
        for (String code : codes) {
            Optional<Room> room = store.get(roomKey(code), Room.class);
            if (room.isEmpty() || room.get().status != Room.Status.LOBBY) {
                redis.opsForSet().remove(OPEN_ROOMS, code); // expired or started: clean up lazily
                continue;
            }
            Room r = room.get();
            Player host = r.player(r.hostId);
            out.add(new OpenRoom(code, host == null ? "?" : host.name, r.players.size(), config.maxPlayers(), r.settings));
        }
        return out;
    }

    // =================================================================================== game =====

    public RoomView start(String code, AuthUser user) {
        Room room = mutate(code, r -> {
            if (!user.id().equals(r.hostId)) throw ApiException.forbidden("Only the host can start the game.");
            if (r.status == Room.Status.RUNNING) throw ApiException.conflict("game_running", "Already running.");
            if (r.players.isEmpty()) throw ApiException.conflict("no_players", "Nobody is in the room.");
            return begin(r);
        });
        afterBegin(room);
        return view(room);
    }

    /** Starts a game immediately (used by matchmaking, no host action needed). */
    void startMatchmade(String code) {
        Room room = mutate(code, this::begin);
        afterBegin(room);
    }

    private Room begin(Room r) {
        try {
            r.questions = questions.random(r.settings.types(), r.settings.region(), r.settings.rounds());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_region", e.getMessage());
        }
        r.status = Room.Status.RUNNING;
        r.round = -1;
        r.roundOpen = false;
        r.game++;
        r.players.values().forEach(p -> {
            p.score = 0;
            p.correct = 0;
            p.answered = 0;
        });
        return r;
    }

    private void afterBegin(Room room) {
        redis.opsForSet().remove(OPEN_ROOMS, room.code);
        Instant firstRound = Instant.now().plus(config.countdown());
        broadcast.toRoom(room.code, "GAME_STARTING", firstRound);
        broadcast.toRoom(room.code, "ROOM_STATE", view(room));
        int game = room.game;
        scheduler.schedule(() -> startRound(room.code, 0, game), firstRound);
    }

    void startRound(String code, int round, int game) {
        Room room;
        try {
            room = mutate(code, r -> {
                if (r.status != Room.Status.RUNNING || r.game != game || r.round >= round) return null; // stale timer
                r.round = round;
                r.roundOpen = true;
                r.roundStartedAt = Instant.now();
                r.roundEndsAt = r.roundStartedAt.plusSeconds(r.settings.roundSeconds());
                r.roundAnswers.clear();
                return r;
            });
        } catch (ApiException e) {
            return; // room expired
        }
        if (room == null) return;
        Question q = room.currentQuestion();
        broadcast.toRoom(code, "ROUND_STARTED",
                new RoundStarted(round, room.questions.size(), q.toPublic(room.questions.size()), room.roundEndsAt));
        scheduler.schedule(() -> endRound(code, round, game), room.roundEndsAt.plus(GRACE));
    }

    public void answer(String code, AuthUser user, int round, String answer) {
        Room room = mutate(code, r -> {
            if (r.status != Room.Status.RUNNING || !r.roundOpen || r.round != round) {
                throw ApiException.conflict("round_closed", "This round is over.");
            }
            if (!r.has(user.id())) throw ApiException.forbidden("You are not in this room.");
            if (r.roundAnswers.containsKey(user.id().toString())) {
                throw ApiException.conflict("already_answered", "You already answered.");
            }
            Instant now = Instant.now();
            if (now.isAfter(r.roundEndsAt.plus(GRACE))) throw ApiException.conflict("round_closed", "Too late.");
            Duration elapsed = Duration.between(r.roundStartedAt, now);
            Question q = r.currentQuestion();
            // scale the time to the question's own limit so the speed bonus is comparable
            Duration scaled = Duration.ofMillis(elapsed.toMillis() * q.type().timeLimit().toMillis()
                    / (r.settings.roundSeconds() * 1000L));
            Scoring.Result s = checker.check(q, answer, scaled);
            r.roundAnswers.put(user.id().toString(),
                    new RoundAnswer(answer, elapsed.toMillis(), s.points(), s.correct(), s.distanceKm()));
            return r;
        });
        broadcast.toRoom(code, "PLAYER_ANSWERED", java.util.Map.of("userId", user.id(), "answered", room.roundAnswers.size()));
        maybeEndRoundEarly(room);
    }

    private void maybeEndRoundEarly(Room room) {
        if (!room.roundOpen) return;
        long waitingFor = room.players.values().stream()
                .filter(p -> p.connected && !room.roundAnswers.containsKey(p.id.toString()))
                .count();
        if (waitingFor == 0) {
            int round = room.round;
            int game = room.game;
            scheduler.schedule(() -> endRound(room.code, round, game), Instant.now().plusMillis(300));
        }
    }

    void endRound(String code, int round, int game) {
        Room room;
        try {
            room = mutate(code, r -> {
                if (r.status != Room.Status.RUNNING || r.game != game || r.round != round || !r.roundOpen) return null;
                r.roundOpen = false;
                r.roundAnswers.forEach((userId, a) -> {
                    Player p = r.players.get(userId);
                    if (p == null) return;
                    p.score += a.points();
                    p.answered++;
                    if (a.correct()) p.correct++;
                });
                return r;
            });
        } catch (ApiException e) {
            return;
        }
        if (room == null) return;

        Question q = room.questions.get(round);
        List<PlayerResult> results = room.players.values().stream().map(p -> {
            RoundAnswer a = room.roundAnswers.get(p.id.toString());
            return a == null ? new PlayerResult(p.id, p.name, null, false, 0, null, 0)
                    : new PlayerResult(p.id, p.name, a.answer(), a.correct(), a.points(), a.distanceKm(), a.elapsedMs());
        }).toList();
        boolean last = round + 1 >= room.questions.size();
        Instant nextAt = Instant.now().plus(config.resultPause());
        broadcast.toRoom(code, "ROUND_ENDED", new RoundEnded(round, q.answer(), checker.correctLabel(q), q.target(),
                results, scoreboard(room), nextAt));
        if (last) scheduler.schedule(() -> finish(code, game), nextAt);
        else scheduler.schedule(() -> startRound(code, round + 1, game), nextAt);
    }

    void finish(String code, int game) {
        Room room;
        try {
            room = mutate(code, r -> {
                if (r.status != Room.Status.RUNNING || r.game != game) return null;
                r.status = Room.Status.FINISHED;
                return r;
            });
        } catch (ApiException e) {
            return;
        }
        if (room == null) return;
        List<Placement> placements = placements(room);
        broadcast.toRoom(code, "GAME_FINISHED", new GameFinished(placements));
        broadcast.toRoom(code, "ROOM_STATE", view(room));
        persist(room, placements);
    }

    /** Back to the lobby with the same players (host only). */
    public RoomView rematch(String code, AuthUser user) {
        Room room = mutate(code, r -> {
            if (!user.id().equals(r.hostId)) throw ApiException.forbidden("Only the host can start a rematch.");
            if (r.status != Room.Status.FINISHED) throw ApiException.conflict("not_finished", "The game is not over yet.");
            r.status = Room.Status.LOBBY;
            r.round = -1;
            r.questions = new ArrayList<>();
            r.roundAnswers.clear();
            r.players.values().removeIf(p -> !p.connected);
            return r;
        });
        broadcast.toRoom(code, "ROOM_STATE", view(room));
        return view(room);
    }

    public void chat(String code, AuthUser user, String text) {
        if (text == null || text.isBlank()) return;
        Room room = load(code);
        if (!room.has(user.id())) throw ApiException.forbidden("You are not in this room.");
        String clean = text.strip();
        if (clean.length() > 200) clean = clean.substring(0, 200);
        broadcast.toRoom(code, "CHAT", new ChatEvent(user.id(), room.player(user.id()).name, clean));
    }

    public byte[] flag(String code, int round) {
        Room room = load(code);
        if (room.status != Room.Status.RUNNING || round != room.round) throw ApiException.notFound("Flag", round);
        Question q = room.currentQuestion();
        if (q == null || q.type() != QuestionType.FLAG) throw ApiException.notFound("Flag", round);
        return flags.svg(q.target()).orElseThrow(() -> ApiException.notFound("Flag", round));
    }

    // ================================================================================ helpers =====

    /**
     * lock → load → change → save. The function may return null to signal "nothing to do" (then nothing
     * is saved and null is returned).
     */
    private Room mutate(String code, Function<Room, Room> change) {
        return lock.withLock("room:" + code, Duration.ofSeconds(5), Duration.ofSeconds(4), () -> {
            Room room = load(code);
            Room changed = change.apply(room);
            if (changed != null) save(changed);
            return changed;
        });
    }

    private Room load(String code) {
        return store.get(roomKey(code.toUpperCase()), Room.class)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "room_not_found", "Room " + code + " does not exist."));
    }

    private void save(Room room) {
        store.set(roomKey(room.code), room, config.roomTtl());
    }

    private void leaveCurrentRoom(AuthUser user) {
        String current = redis.opsForValue().get(userRoomKey(user.id()));
        if (current != null) {
            try {
                leave(current, user);
            } catch (ApiException ignored) {
                redis.delete(userRoomKey(user.id()));
            }
        }
    }

    private String newCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder sb = new StringBuilder(5);
            for (int i = 0; i < 5; i++) sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
            String code = sb.toString();
            // reserve the code atomically; the real room JSON is written right after
            if (Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(roomKey(code), "{}", Duration.ofMinutes(1)))) return code;
        }
        throw new IllegalStateException("Could not allocate a room code");
    }

    private static List<Placement> placements(Room room) {
        List<Player> sorted = room.players.values().stream()
                .sorted(Comparator.comparingInt((Player p) -> p.score).reversed()).toList();
        List<Placement> out = new ArrayList<>();
        int place = 0;
        int lastScore = Integer.MIN_VALUE;
        for (int i = 0; i < sorted.size(); i++) {
            Player p = sorted.get(i);
            if (p.score != lastScore) place = i + 1; // ties share a placement
            lastScore = p.score;
            out.add(new Placement(place, p.id, p.name, p.score, p.correct));
        }
        return out;
    }

    private void persist(Room room, List<Placement> placements) {
        UUID gameId = UUID.randomUUID();
        try {
            tx.executeWithoutResult(s -> {
                jdbc.sql("insert into multiplayer_game (id, room_code, rounds) values (:id, :code, :rounds)")
                        .param("id", gameId).param("code", room.code).param("rounds", room.questions.size()).update();
                for (Placement p : placements) {
                    jdbc.sql("""
                                    insert into multiplayer_participant (game_id, user_id, name, score, placement)
                                    values (:g, :u, :n, :s, :p)
                                    """)
                            .param("g", gameId).param("u", p.userId()).param("n", p.name()).param("s", p.score())
                            .param("p", p.placement()).update();
                }
            });
        } catch (Exception e) {
            log.warn("Could not persist multiplayer game {}: {}", room.code, e.getMessage());
        }
        events.publish(new MultiplayerFinished(UUID.randomUUID().toString(), Instant.now(), gameId, room.code,
                room.questions.size(), placements.stream().map(p -> {
                    Player pl = room.players.get(p.userId().toString());
                    return new MultiplayerFinished.Placement(p.userId(), p.name(), p.score(), p.placement(), p.correct(),
                            pl == null ? 0 : pl.answered);
                }).toList()));
    }

    private static List<PlayerView> scoreboard(Room room) {
        return room.players.values().stream()
                .sorted(Comparator.comparingInt((Player p) -> p.score).reversed())
                .map(p -> playerView(room, p)).toList();
    }

    private static PlayerView playerView(Room room, Player p) {
        return new PlayerView(p.id, p.name, p.score, p.correct, p.connected, p.id.equals(room.hostId));
    }

    static RoomView view(Room room) {
        Question q = room.status == Room.Status.RUNNING && room.roundOpen ? room.currentQuestion() : null;
        return new RoomView(room.code, room.status, room.hostId, room.settings, room.isPublic,
                room.players.values().stream().map(p -> playerView(room, p)).toList(), room.round,
                room.questions.size(), q == null ? null : q.toPublic(room.questions.size()),
                q == null ? null : room.roundEndsAt, room.roundAnswers.size());
    }

    private static String roomKey(String code) {
        return "room:" + code;
    }

    private static String userRoomKey(UUID userId) {
        return "user-room:" + userId;
    }
}
