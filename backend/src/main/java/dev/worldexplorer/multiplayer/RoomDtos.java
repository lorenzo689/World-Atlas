package dev.worldexplorer.multiplayer;

import dev.worldexplorer.quiz.engine.Question.PublicQuestion;
import dev.worldexplorer.quiz.engine.QuestionType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RoomDtos {

    public record CreateRoomRequest(
            @Min(3) @Max(20) Integer rounds,
            @Size(max = 4) List<QuestionType> types,
            String region,
            @Min(8) @Max(40) Integer roundSeconds,
            boolean isPublic) {}

    public record PlayerView(UUID id, String name, int score, int correct, boolean connected, boolean host) {}

    /** What everybody in the room may see (no answers). */
    public record RoomView(String code, Room.Status status, UUID hostId, Room.Settings settings, boolean isPublic,
            List<PlayerView> players, int round, int totalRounds, PublicQuestion question, Instant roundEndsAt,
            int answeredThisRound) {}

    public record OpenRoom(String code, String hostName, int players, int maxPlayers, Room.Settings settings) {}

    // ---- WebSocket messages (client → server)
    public record AnswerMessage(int round, @Size(max = 8) String answer) {}

    public record ChatMessage(@Size(max = 200) String text) {}

    // ---- WebSocket events (server → clients), sent as {"type": "...", "data": {...}, "at": "..."}
    public record RoomEvent(String type, Object data, Instant at) {
        public static RoomEvent of(String type, Object data) {
            return new RoomEvent(type, data, Instant.now());
        }
    }

    public record RoundStarted(int round, int total, PublicQuestion question, Instant endsAt) {}

    public record PlayerResult(UUID userId, String name, String answer, boolean correct, int points, Double distanceKm,
            long elapsedMs) {}

    public record RoundEnded(int round, String correctAnswer, String correctLabel, String target,
            List<PlayerResult> results, List<PlayerView> scoreboard, Instant nextAt) {}

    public record Placement(int placement, UUID userId, String name, int score, int correct) {}

    public record GameFinished(List<Placement> placements) {}

    public record ChatEvent(UUID userId, String name, String text) {}

    public record MatchFound(String roomCode) {}

    private RoomDtos() {}
}
