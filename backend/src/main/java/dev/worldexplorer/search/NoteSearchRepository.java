package dev.worldexplorer.search;

import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

public interface NoteSearchRepository extends ElasticsearchRepository<NoteDocument, String> {

    void deleteByUserId(String userId);
}
