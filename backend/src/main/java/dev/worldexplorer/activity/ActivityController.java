package dev.worldexplorer.activity;

import dev.worldexplorer.activity.ActivityService.DayBucket;
import dev.worldexplorer.activity.ActivityService.FeedItem;
import dev.worldexplorer.activity.ActivityService.Popular;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Activity & analytics", description = "Event log built from Kafka domain events in Elasticsearch")
@RestController
public class ActivityController {

    private final ActivityService activity;

    public ActivityController(ActivityService activity) {
        this.activity = activity;
    }

    @Operation(summary = "Public live feed (quiz results, matches, new players …)")
    @GetMapping("/api/activity/recent")
    List<FeedItem> recent(@RequestParam(defaultValue = "20") int limit) {
        return activity.recent(limit);
    }

    @GetMapping("/api/activity/popular")
    Popular popular(@RequestParam(defaultValue = "10") int limit) {
        return activity.popular(limit);
    }

    @Operation(summary = "Events per day by type, with average quiz score (admin)")
    @GetMapping("/api/analytics/activity")
    List<DayBucket> perDay(@RequestParam(defaultValue = "14") int days) {
        return activity.perDay(days);
    }
}
