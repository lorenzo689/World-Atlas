package dev.worldexplorer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.resilience.annotation.EnableResilientMethods;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * World Explorer backend.
 *
 * <p>Package layout is "by feature" (a modular monolith). Each top-level package is one module with
 * its own entities, services and controllers:
 *
 * <ul>
 *   <li>{@code country}   – country reference data (PostgreSQL, seeded from the frontend's countries.json)
 *   <li>{@code search}    – full-text / geo search over countries and notes (Elasticsearch)
 *   <li>{@code indicator} – data platform: World Bank ingestion pipeline (Kafka → PostgreSQL) + analytics API
 *   <li>{@code auth}      – users, JWT access tokens, refresh tokens in Redis
 *   <li>{@code atlas}     – the personal atlas: favourites, travel log, notes, saved globe views
 *   <li>{@code quiz}      – single-player geo quiz, daily challenge, leaderboards (Redis sorted sets)
 *   <li>{@code multiplayer} – real-time rooms over WebSocket/STOMP, matchmaking, Redis pub/sub relay
 *   <li>{@code activity}  – event log + analytics from Kafka domain events (Elasticsearch aggregations)
 *   <li>{@code common}    – cross-cutting: errors, security, Kafka topics/events, Redis helpers
 * </ul>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
@EnableCaching
@EnableAsync
@EnableResilientMethods
public class WorldExplorerApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorldExplorerApplication.class, args);
    }
}
