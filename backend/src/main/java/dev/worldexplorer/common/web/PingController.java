package dev.worldexplorer.common.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cheap liveness check for the frontend ("is the backend there?"). Unlike /actuator/health it touches
 * no database, so it answers instantly even under load.
 */
@Tag(name = "Health")
@RestController
public class PingController {

    @Operation(summary = "Is the API reachable?")
    @GetMapping("/api/health")
    Map<String, Object> ping() {
        return Map.of("status", "UP", "time", Instant.now());
    }
}
