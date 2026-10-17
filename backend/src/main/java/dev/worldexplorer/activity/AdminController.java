package dev.worldexplorer.activity;

import dev.worldexplorer.search.CountryIndexer;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Admin")
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final SystemOverviewService overview;
    private final CountryIndexer countryIndexer;
    private final OutboxOperationsService outbox;

    public AdminController(SystemOverviewService overview, CountryIndexer countryIndexer, OutboxOperationsService outbox) {
        this.overview = overview;
        this.countryIndexer = countryIndexer;
        this.outbox = outbox;
    }

    @GetMapping("/overview")
    SystemOverviewService.Overview overview() {
        return overview.overview();
    }

    @PostMapping("/search/reindex")
    Map<String, Integer> reindex() {
        return Map.of("countries", countryIndexer.reindex());
    }

    @GetMapping("/events/outbox")
    OutboxOperationsService.Status outbox() {
        return outbox.status();
    }

    @PostMapping("/events/outbox/{id}/retry")
    void retryOutbox(@PathVariable UUID id) {
        outbox.retry(id);
    }
}
