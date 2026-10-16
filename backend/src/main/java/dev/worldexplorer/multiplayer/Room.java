package dev.worldexplorer.multiplayer;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import dev.worldexplorer.quiz.engine.Question;
import dev.worldexplorer.quiz.engine.QuestionType;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Server-side state of a multiplayer room, stored as JSON in Redis ({@code room:<code>}).
 *
 * <p>A small mutable class: it is always loaded, changed and written back while holding the room's
 * Redis lock, so there is exactly one writer at a time (see {@link RoomService}).
 *
 * <pre>
 *   LOBBY ──start──▶ RUNNING (round 0 … n-1: question → answers → results) ──▶ FINISHED ──rematch──▶ LOBBY
 * </pre>
 */
@JsonAutoDetect(fieldVisibility = Visibility.ANY, getterVisibility = Visibility.NONE, isGetterVisibility = Visibility.NONE)
public class Room {

    public enum Status { LOBBY, RUNNING, FINISHED }

    public record Settings(int rounds, List<QuestionType> types, String region, int roundSeconds) {}

    public static class Player {
        public UUID id;
        public String name;
        public int score;
        public int correct;
        public int answered;
        public boolean connected = true;
        public Instant joinedAt;

        public Player() {}

        public Player(UUID id, String name) {
            this.id = id;
            this.name = name;
            this.joinedAt = Instant.now();
        }
    }

    public record RoundAnswer(String answer, long elapsedMs, int points, boolean correct, Double distanceKm) {}

    public String code;
    public UUID hostId;
    public Status status = Status.LOBBY;
    public Settings settings;
    public boolean isPublic;
    public boolean matchmade;
    /** Insertion order = join order. Keyed by user id (string, so it is a plain JSON object key). */
    public Map<String, Player> players = new LinkedHashMap<>();
    public List<Question> questions = new ArrayList<>();
    public int round = -1;
    public boolean roundOpen;
    public Instant roundStartedAt;
    public Instant roundEndsAt;
    public Map<String, RoundAnswer> roundAnswers = new LinkedHashMap<>();
    public Instant createdAt = Instant.now();
    /** Bumped on every save – lets timers detect that they belong to an old game (rematch). */
    public int game;

    public Room() {}

    public Room(String code, UUID hostId, Settings settings, boolean isPublic) {
        this.code = code;
        this.hostId = hostId;
        this.settings = settings;
        this.isPublic = isPublic;
    }

    public boolean has(UUID userId) {
        return players.containsKey(userId.toString());
    }

    public Player player(UUID userId) {
        return players.get(userId.toString());
    }

    public long connectedCount() {
        return players.values().stream().filter(p -> p.connected).count();
    }

    public Question currentQuestion() {
        return round >= 0 && round < questions.size() ? questions.get(round) : null;
    }
}
