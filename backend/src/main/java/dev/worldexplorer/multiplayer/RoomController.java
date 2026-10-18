package dev.worldexplorer.multiplayer;

import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.multiplayer.RoomDtos.CreateRoomRequest;
import dev.worldexplorer.multiplayer.RoomDtos.OpenRoom;
import dev.worldexplorer.multiplayer.RoomDtos.RoomView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Room management over HTTP (create, join, start …). The game itself – answers, chat, live events –
 * runs over WebSocket (see {@link RoomMessagingController}).
 */
@Tag(name = "Multiplayer")
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService rooms;
    private final MatchmakingService matchmaking;

    public RoomController(RoomService rooms, MatchmakingService matchmaking) {
        this.rooms = rooms;
        this.matchmaking = matchmaking;
    }

    @Operation(summary = "Public rooms waiting for players")
    @GetMapping
    List<OpenRoom> open() {
        return rooms.openRooms();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    RoomView create(AuthUser user, @Valid @RequestBody CreateRoomRequest body) {
        return rooms.create(user, body, false);
    }

    @GetMapping("/{code}")
    RoomView get(AuthUser user, @PathVariable String code) {
        return rooms.get(code.toUpperCase(), user);
    }

    @PostMapping("/{code}/join")
    RoomView join(AuthUser user, @PathVariable String code) {
        return rooms.join(code.toUpperCase(), user);
    }

    @PostMapping("/{code}/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void leave(AuthUser user, @PathVariable String code) {
        rooms.leave(code.toUpperCase(), user);
    }

    @PostMapping("/{code}/start")
    RoomView start(AuthUser user, @PathVariable String code) {
        return rooms.start(code.toUpperCase(), user);
    }

    @PostMapping("/{code}/rematch")
    RoomView rematch(AuthUser user, @PathVariable String code) {
        return rooms.rematch(code.toUpperCase(), user);
    }

    @GetMapping("/{code}/rounds/{round}/flag")
    ResponseEntity<byte[]> flag(AuthUser user, @PathVariable String code, @PathVariable int round) {
        return ResponseEntity.ok().contentType(MediaType.valueOf("image/svg+xml")).cacheControl(CacheControl.noStore())
                .body(rooms.flag(code.toUpperCase(), round, user));
    }

    @Operation(summary = "Enter the quick-match queue; the match arrives on /user/queue/match")
    @PostMapping("/matchmaking")
    Map<String, Long> joinQueue(AuthUser user) {
        return Map.of("waiting", matchmaking.join(user));
    }

    @PostMapping("/matchmaking/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void leaveQueue(AuthUser user) {
        matchmaking.leave(user.id());
    }
}
