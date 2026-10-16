package dev.worldexplorer.activity;

import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

public interface ActivityRepository extends ElasticsearchRepository<ActivityDocument, String> {}
