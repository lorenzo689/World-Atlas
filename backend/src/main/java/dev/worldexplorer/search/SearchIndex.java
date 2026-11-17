package dev.worldexplorer.search;

/**
 * Registers an Elasticsearch document class whose index {@link IndexBootstrap} should create.
 *
 * <p>Modules declare one bean per document ({@code @Bean SearchIndex x() { return new SearchIndex(X.class); }}).
 * Spring injects all of them into {@link IndexBootstrap} as a list. This way the search module does
 * not need to know the documents of other modules (e.g. activity), which used to be a dependency cycle.
 *
 * @param document a class annotated with {@code @Document(createIndex = false)}
 */
public record SearchIndex(Class<?> document) {}
