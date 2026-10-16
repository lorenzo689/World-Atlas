package dev.worldexplorer.search;

import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

public interface CountrySearchRepository extends ElasticsearchRepository<CountryDocument, String> {}
