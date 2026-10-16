package dev.worldexplorer.indicator;

import dev.worldexplorer.indicator.IndicatorDtos.IngestionRunDto;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Admin: ingestion")
@RestController
@RequestMapping("/api/admin/ingestion")
public class IngestionAdminController {

    private final IngestionService ingestion;

    public IngestionAdminController(IngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping("/{key}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    IngestionRunDto run(@PathVariable String key) {
        return ingestion.trigger(IndicatorDefinition.of(key), IngestionRun.Trigger.MANUAL);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    void runAll() {
        ingestion.triggerAll(IngestionRun.Trigger.MANUAL);
    }

    @GetMapping("/runs")
    List<IngestionRunDto> runs(@RequestParam(defaultValue = "50") int limit) {
        return ingestion.recentRuns(limit);
    }
}
