# Load test (k6)

```bash
# 1. backend with the rate limits raised (otherwise the limiter is what gets measured)
cd backend && APP_RATELIMIT_AUTHPERMINUTE=100000 APP_RATELIMIT_APIPERMINUTE=10000000 ./mvnw spring-boot:run

# 2. k6 in Docker, nothing to install
docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 -e PLAYERS=15 grafana/k6:1.3.0 run - < loadtest/quiz.js
```

Scenario: `PLAYERS` virtual users (default 20) each register as a guest and play a complete 10-question quiz,
while 100 requests/s hit the cached data-platform endpoints.

## Result on the development laptop

Everything on one machine: Windows laptop, 8 GB RAM, Docker Desktop with 3.75 GB for PostgreSQL + Redis + Kafka +
Elasticsearch, backend (`mvnw spring-boot:run`), k6 and a browser all competing for the same cores.
15 players + 100 reads/s for 70 s:

| Metric | Value |
| --- | --- |
| Requests | 9 547 (≈ 129 /s), **0 % failed**, 100 % of checks passed |
| Quiz answer (POST, Redis lock + scoring) | median 100 ms · p90 213 ms · p95 260 ms |
| Cached reads (indicators) | median 65 ms · p90 153 ms · p95 209 ms |
| Complete game incl. "thinking" pauses | median 7.7 s for 10 questions |

These numbers are dominated by the shared, memory-starved laptop (the Kafka broker alone was throttled by it
at times), not by the application: on a dedicated 2-vCPU server expect markedly lower tail latencies.
Use the Grafana dashboard (`docker compose --profile monitoring up -d`) while the test runs to watch the
JVM, connection pool, Kafka lag and the outbox backlog (`outbox.pending`).
