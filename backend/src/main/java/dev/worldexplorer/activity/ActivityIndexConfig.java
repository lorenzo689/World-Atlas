package dev.worldexplorer.activity;

import dev.worldexplorer.search.SearchIndex;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the activity index with the search module's {@code IndexBootstrap}. The dependency points
 * from activity to search only; search no longer needs to know {@link ActivityDocument}.
 */
@Configuration
class ActivityIndexConfig {

    @Bean
    SearchIndex activityIndex() {
        return new SearchIndex(ActivityDocument.class);
    }
}
