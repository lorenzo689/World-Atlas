package dev.worldexplorer.conflict;

import dev.worldexplorer.common.security.AuthUser;
import dev.worldexplorer.conflict.ConflictDtos.Brief;
import dev.worldexplorer.conflict.ConflictDtos.Revision;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Conflict learning points")
@RestController
public class ConflictController {
    private final ConflictService service;

    public ConflictController(ConflictService service) {
        this.service = service;
    }

    @GetMapping("/api/conflicts")
    List<Brief> published() {
        return service.published();
    }

    @GetMapping("/api/conflicts/{id}/history")
    List<Revision> history(@PathVariable String id) {
        return service.history(id);
    }

    @GetMapping("/api/admin/conflicts")
    List<Revision> editorialQueue() {
        return service.editorialQueue();
    }

    @PostMapping("/api/admin/conflicts/drafts")
    @ResponseStatus(HttpStatus.CREATED)
    Revision draft(AuthUser user, @RequestBody Brief brief) {
        return service.draft(brief, user.id());
    }

    @PostMapping("/api/admin/conflicts/revisions/{id}/publish")
    Revision publish(@PathVariable UUID id) {
        return service.publish(id);
    }

    @PostMapping("/api/admin/conflicts/check-sources")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void checkSources() {
        service.checkSources();
    }
}
