package dev.worldexplorer.search;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Indices owned by the search module itself; see {@link SearchIndex}. */
@Configuration
class SearchIndexConfig {

    @Bean
    SearchIndex noteIndex() {
        return new SearchIndex(NoteDocument.class);
    }
}
