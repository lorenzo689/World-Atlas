# World Explorer – Backend-Leitfaden

Dieser Leitfaden erklärt, **wie das Spring-Boot-Backend aufgebaut ist und warum**. Er ist als Lernpfad
gedacht: erst das Gesamtbild, dann jede Technologie, dann die wichtigsten Abläufe Schritt für Schritt
mit Verweisen auf die Dateien.

---

## 1. Gesamtbild

```
 Browser (React + three.js)
    │  HTTP /api/**  ·  WebSocket /ws (STOMP)
    ▼
 Vite-Dev-Server (Proxy, nur in der Entwicklung)
    ▼
 Spring Boot 4.1 (Java 25, virtuelle Threads) ─────────────────────────────────────────┐
    │                │                    │                         │                │
    ▼                ▼                    ▼                         ▼                ▼
 PostgreSQL       Redis               Kafka                   Elasticsearch     World Bank API
 (Wahrheit)       (schnell, flüchtig) (Ereignisse, Pipeline)  (Suche, Analytik) (externe Daten)
```

| Speicher | Rolle | Was liegt dort |
| --- | --- | --- |
| **PostgreSQL** | System of Record, transaktional | Länder, Nutzer, Indikatorwerte (≈120 000 Zeilen), Atlas, Quiz-Ergebnisse, Statistiken |
| **Redis** | schneller, kurzlebiger Zustand | Cache, Refresh-Tokens, Quiz-Sitzungen, Multiplayer-Räume, Leaderboards, Rate-Limits, Locks, Pub/Sub |
| **Kafka** | Ereignis-Log, Entkopplung | Ingestion-Pipeline (`indicator.raw`) und Domain-Events (Quiz beendet, Atlas geändert, …) |
| **Elasticsearch** | Such- und Analyse-Lesemodelle | Länder-Suche (Tippfehler, Präfixe, Geo), Notizsuche, Aktivitätslog mit Aggregationen |

**Grundregel:** PostgreSQL ist die Wahrheit. Redis und Elasticsearch enthalten nur Daten, die man aus
PostgreSQL bzw. aus Kafka-Ereignissen jederzeit neu aufbauen kann.

---

## 2. Starten

```bash
docker compose up -d                       # postgres:5433, redis:6379, kafka:9092, elasticsearch:9200
cd backend && ./mvnw spring-boot:run       # Backend auf http://localhost:8080
npm run dev                                # Frontend auf http://localhost:5173 (Proxy auf das Backend)
```

- **API-Doku (Swagger UI):** http://localhost:8080/swagger-ui.html
- **Kafka UI:** `docker compose --profile tools up -d` → http://localhost:8090
- **Metriken:** http://localhost:8080/actuator/prometheus, Health: `/actuator/health`
- **Admin-Konto:** einfach mit `admin@worldexplorer.dev` registrieren (siehe `app.admin-emails`).
- Beim ersten Start lädt das Backend alle 16 Indikatoren von der Weltbank (Internet nötig, ≈30 s).

Tests:

```bash
cd backend
./mvnw test      # Unit-Tests (schnell, ohne Docker)
./mvnw verify    # + Integrationstests (*IT) gegen echte Container via Testcontainers
```

---

## 3. Paketstruktur (modularer Monolith)

Das Backend ist **nach Fachlichkeit** geschnitten, nicht nach Schichten. Jedes Paket ist ein Modul mit
eigenen Entities, Services und Controllern. Module sprechen über Services oder **Ereignisse** miteinander.

| Paket | Aufgabe | Einstieg |
| --- | --- | --- |
| `common` | Querschnitt: Fehlerformat, Security/JWT, Kafka-Topics & Events, Redis-Helfer | `common/security/SecurityConfig.java` |
| `country` | Länder-Stammdaten, Seeding aus `public/data/countries.json` | `CountrySeeder`, `CountryCatalog` |
| `auth` | Registrierung, Login, Gäste, Token-Refresh | `AuthService`, `TokenService` |
| `indicator` | **Daten-Plattform**: Ingestion-Pipeline + Analyse-API | `IngestionService`, `IndicatorValueRepository` |
| `search` | Elasticsearch-Dokumente, Indexer, Suche | `SearchService`, `CountryDocument` |
| `atlas` | **Persönlicher Atlas**: Favoriten, Reiselog, Notizen, gespeicherte Ansichten | `AtlasService` |
| `quiz` | **Geo-Quiz**: Fragen, Bewertung, Daily Challenge, Leaderboards, Statistik | `QuizService`, `quiz/engine/*` |
| `multiplayer` | **Echtzeit-Spiel** über WebSocket, Matchmaking | `RoomService`, `WebSocketConfig` |
| `activity` | Aktivitätslog & Analytik aus Kafka-Events, Admin-Übersicht | `ActivityIndexer`, `SystemOverviewService` |

Typischer Aufbau eines Moduls: `XyzController` (HTTP) → `XyzService` (Logik, Transaktionen) →
`XyzRepository` (Spring Data JPA oder JDBC) + `XyzDtos` (Records für Requests/Responses).

---

## 4. Die Technologien im Einsatz

### 4.1 PostgreSQL + JPA + Flyway

- **Schema** gehört Flyway: `src/main/resources/db/migration/V1__schema.sql`. Hibernate prüft nur
  (`ddl-auto: validate`). Neue Spalten = neue Migration `V2__…sql`, nie die alte ändern.
- **JPA** für normale Fachobjekte (`Note`, `AppUser`, `SavedView`, …).
  - PostgreSQL-Arrays (`text[]`) als Java-Arrays: `Country.borders`, `AppUser.roles`.
  - `@ElementCollection` für Kind-Tabellen ohne eigene Identität: `Country.currencies`.
  - Zusammengesetzte Schlüssel mit `@IdClass`: `Favorite`, `TravelEntry` (`UserCountryId`).
  - **Optimistic Locking** mit `@Version`: `Note`. Zwei Tabs bearbeiten dieselbe Notiz → der zweite
    Speichervorgang bekommt 409 statt die Änderung des ersten zu überschreiben.
- **JDBC/SQL** für Analytik (`IndicatorValueRepository`), weil JPA dafür ungeeignet ist:
  - Upsert in Batches: `INSERT … ON CONFLICT … DO UPDATE`
  - `DISTINCT ON` (letzter Wert je Land), Fensterfunktionen `rank() over (…)`,
    `percentile_cont` (Quartile), `corr()` (Pearson-Korrelation)

### 4.2 Redis – sieben Verwendungen

| Verwendung | Datenstruktur | Datei |
| --- | --- | --- |
| Cache (`@Cacheable`) | String (JSON) mit TTL | `CacheConfig`, `CountryService`, `IndicatorQueryService` |
| Refresh-Tokens | String `refresh:<sha256>` → userId, TTL 14 Tage | `TokenService` |
| Quiz-Sitzung | String (JSON) `quiz:session:<id>`, TTL 1 h | `QuizService`, `RedisJson` |
| Multiplayer-Raum | String (JSON) `room:<code>` | `RoomService` |
| Leaderboards | **Sorted Set** (`ZADD`, `ZREVRANGE`, `ZREVRANK`) | `LeaderboardService` |
| Rate-Limiting | Zähler mit `INCR` + `PEXPIRE` per **Lua-Skript** | `RateLimiter`, `RateLimitInterceptor` |
| Verteilte Sperre | `SET NX PX` + Lua-Release | `RedisLock` |
| Matchmaking-Warteschlange | Sorted Set + atomares Lua-`ZPOPMIN` | `MatchmakingService` |
| WebSocket über mehrere Instanzen | **Pub/Sub** | `RoomBroadcaster`, `RedisWebSocketRelay` |

Warum Lua? Redis führt ein Skript **atomar** aus. „Lies den Wert, entscheide, schreibe“ ist damit eine
unteilbare Operation, auch wenn hundert Anfragen gleichzeitig kommen.

### 4.3 Kafka – Pipeline und Domain-Events

**Topics** (`common/events/Topics.java`, angelegt in `KafkaConfig`):

| Topic | Partitionen | Inhalt | Konsumenten (Consumer Group) |
| --- | --- | --- | --- |
| `indicator.raw` | 6 | jede einzelne Beobachtung der Weltbank | `indicator-writer` (Batch, 3 Threads) |
| `indicator.ingested` | 1 | „Indikator X fertig eingelesen“ | `indicator-cache`, `activity-indexer` |
| `user.registered` | 3 | neues Konto / neuer Gast | `activity-indexer` |
| `atlas.changed` | 3 | Favorit/Reise/Notiz/Ansicht geändert | `note-indexer`, `activity-indexer` |
| `quiz.completed` | 3 | Quiz beendet, mit allen Antworten | `player-stats`, `activity-indexer` |
| `multiplayer.finished` | 3 | Spiel beendet, mit Platzierungen | `player-stats`, `activity-indexer` |
| `*.dlt` | 1 | Dead-Letter: Nachrichten, die auch nach 2 Wiederholungen scheitern | (zur Analyse) |

Wichtige Konzepte und wo man sie sieht:

- **Schlüssel = Partition = Reihenfolge.** `indicator.raw` hat das Land als Schlüssel, alle Werte eines
  Landes landen in derselben Partition und werden der Reihe nach verarbeitet.
- **Consumer Groups.** Jede Gruppe bekommt *jede* Nachricht. `activity-indexer` und `player-stats`
  lesen beide `quiz.completed`, unabhängig voneinander (Publish/Subscribe).
- **Batch-Listener.** `IndicatorRawConsumer` bekommt bis zu 1000 Datensätze pro Aufruf und schreibt
  sie mit einem einzigen JDBC-Batch.
- **Fehlerbehandlung.** `DefaultErrorHandler` wiederholt 2× und schickt dann auf `<topic>.dlt`.
  Kaputte JSON-Nachrichten fängt der `ErrorHandlingDeserializer`.
- **Events erst nach dem Commit.** `EventPublisher` nutzt `@TransactionalEventListener(AFTER_COMMIT)`:
  Wird die DB-Transaktion zurückgerollt, geht auch kein Event raus.
- **Idempotente Konsumenten.** Kafka liefert „mindestens einmal“. `IdempotencyGuard` merkt sich
  verarbeitete Event-IDs in `processed_event` – in derselben Transaktion wie die eigentliche Änderung.

### 4.4 Elasticsearch – Suche und Analytik

| Index | Dokument | Wofür |
| --- | --- | --- |
| `countries` | `CountryDocument` | Suche mit Tippfehlern, Präfixen, Akzenten; Geo-Distanz |
| `notes` | `NoteDocument` | Volltextsuche in den eigenen Notizen |
| `activity` | `ActivityDocument` | Live-Feed, Ereignisse pro Tag, Trend-Länder |

- **Analyzer** (`resources/elasticsearch/countries-settings.json`): `folding` (klein + Akzente weg:
  „bogota“ findet „Bogotá“) und `autocomplete` mit Edge-N-Grams („ger“ findet „Germany“).
- **Abfragen** in `SearchService`: `bool` aus `term` (exakter Code), `multi_match` auf N-Gram-Feldern
  und `multi_match` mit `fuzziness: AUTO` („germny“), plus Region als `filter` und Region-Facette
  als `terms`-Aggregation. Geo: `geo_distance`-Abfrage + Sortierung nach Distanz.
- **Aggregationen** in `ActivityService`: `date_histogram` pro Tag mit Unter-Aggregationen
  `terms` (nach Ereignistyp) und `avg` (Quiz-Punkte).
- **CQRS-Lesemodelle:** Notizen und Aktivitäten werden aus Kafka-Events projiziert. Die Daten in
  Elasticsearch sind damit „irgendwann konsistent“ (eventual consistency) – meist nach Millisekunden.

---

## 5. Abläufe Schritt für Schritt

### 5.1 Anmeldung und Token-Refresh

1. `POST /api/auth/login` → `AuthController` → `AuthService.login` prüft das Passwort mit BCrypt.
   (Bei unbekannter E-Mail wird gegen einen Dummy-Hash geprüft, damit die Antwortzeit nichts verrät.)
2. `TokenService.issue` erzeugt
   - ein **Access-Token** (JWT, HS256, 15 min) mit `sub` = Nutzer-ID, `name`, `roles`, `guest`
   - ein **Refresh-Token** (zufällig, 256 Bit). In Redis liegt nur sein SHA-256-Hash.
3. Jede weitere Anfrage schickt `Authorization: Bearer <jwt>`. Spring Security prüft Signatur,
   Ablauf und Aussteller (`JwtConfig`) – ohne Datenbankzugriff.
4. Läuft das Access-Token ab, ruft das Frontend `POST /api/auth/refresh` (`src/lib/api.ts`).
   Das alte Refresh-Token wird dabei gelöscht (**Rotation**), ein gestohlenes Token funktioniert so
   höchstens einmal.

Rollen: `GUEST` (Spitzname, darf spielen), `USER` (Konto, darf den Atlas nutzen), `ADMIN`.
Die Regeln stehen zentral in `SecurityConfig`.

### 5.2 Ingestion-Pipeline der Daten-Plattform

```
IngestionScheduler (Start / Sonntag 3 Uhr / Admin-Button)
  → IngestionService.trigger
      1. IngestionRun in PostgreSQL anlegen (Status FETCHING)
      2. Redis-Lock "ingestion:<key>" (nur eine Instanz lädt denselben Indikator)
      3. WorldBankClient.fetchAll  (@Retryable: 3 Versuche mit Backoff)
      4. jede Beobachtung → Kafka indicator.raw (Schlüssel = Land)
      5. Status PUBLISHED, fetched = Anzahl
  → IndicatorRawConsumer (Batch)
      6. Upsert in indicator_value
      7. Redis-Zähler ingestion:<runId>:stored erhöhen
  → IngestionMonitor (alle 3 s)
      8. stored ≥ fetched?  → bedingtes UPDATE auf COMPLETED (nur eine Instanz gewinnt)
      9. Event indicator.ingested
  → IngestionScheduler.evict: Redis-Cache dieses Indikators leeren
  → ActivityIndexer: Eintrag im Aktivitätslog
```

Warum über Kafka statt direkt in die Datenbank? Abruf und Schreiben sind entkoppelt: Der Schreiber
lässt sich skalieren (mehr Partitionen/Konsumenten), Offsets überleben Neustarts, und fehlerhafte
Datensätze landen im Dead-Letter-Topic, statt den ganzen Lauf abzubrechen.

### 5.3 Eine Quiz-Antwort

1. `POST /api/quiz` → `QuizService.start` erzeugt Fragen (`QuestionGenerator`), speichert die Sitzung
   **inklusive Antworten** in Redis und gibt nur die ID zurück.
2. `GET /api/quiz/{id}/question` liefert die aktuelle Frage **ohne Antwort** und startet die Uhr
   (`servedAt`) – die Zeit misst der Server, nicht der Browser.
3. `POST /api/quiz/{id}/answer` → unter einem Redis-Lock pro Sitzung (kein Doppelklick-Doppelzählen)
   prüft `AnswerChecker` die Antwort, `Scoring` berechnet Punkte (Basis + Zeitbonus bzw. Distanz).
4. Nach der letzten Frage: Ergebnis in PostgreSQL, Leaderboards in Redis, Event `quiz.completed`.
5. `PlayerStatsService` (Kafka) aktualisiert `player_stats` idempotent.

Flaggenfragen: Das Bild kommt von `/api/quiz/{id}/questions/{n}/flag`. Würde das Frontend
`/flags/DEU.svg` laden, stünde die Antwort in der URL.

### 5.4 Eine Multiplayer-Runde

```
Host: POST /api/rooms/{code}/start
  RoomService.start → Fragen erzeugen, Status RUNNING
  → Broadcast GAME_STARTING; TaskScheduler plant startRound(0) in 3 s
startRound(n): Frage öffnen, endsAt setzen → Broadcast ROUND_STARTED; plant endRound(n)
Spieler: STOMP SEND /app/rooms/{code}/answer  → RoomMessagingController → RoomService.answer
  (alle verbundenen Spieler geantwortet? → endRound sofort)
endRound(n): Punkte gutschreiben → Broadcast ROUND_ENDED; plant startRound(n+1) oder finish
finish: Status FINISHED → Broadcast GAME_FINISHED; Ergebnis in PostgreSQL; Event multiplayer.finished
```

- **Jede Änderung** folgt dem Muster *Lock → Laden → Prüfen → Ändern → Speichern → Senden*
  (`RoomService.mutate`). Timer sind idempotent: ein schon beendete Runde wird nicht zweimal beendet.
- **Broadcast über Redis Pub/Sub:** `RoomBroadcaster` veröffentlicht, `RedisWebSocketRelay` empfängt
  auf *jeder* Instanz und leitet an die lokalen WebSocket-Verbindungen weiter. So funktioniert das
  Spiel auch, wenn die Spieler mit verschiedenen Backend-Instanzen verbunden sind.
- **Authentifizierung:** Browser können beim WebSocket-Handshake keine Header setzen. Das JWT steht
  deshalb im STOMP-`CONNECT`-Frame und wird in `JwtChannelInterceptor` geprüft.

### 5.5 Notiz speichern → Notiz finden

```
PUT /api/atlas/notes/{id} (mit version)  → AtlasService.updateNote
   @Version-Prüfung → 409 bei veralteter Version
   Event AtlasChanged(NOTE_SAVED) – erst nach dem Commit nach Kafka
→ NoteIndexer (Kafka) lädt die Notiz aus PostgreSQL und schreibt sie nach Elasticsearch
→ GET /api/atlas/notes/search?q=… sucht nur in den eigenen Notizen (Filter auf userId)
```

---

## 6. Querschnittsthemen

- **Fehlerformat:** Jeder Fehler ist ein RFC-9457-„Problem Detail“ mit stabilem `code`
  (`GlobalExceptionHandler`, `ApiException`), z. B. `{"status":409,"code":"stale_version",…}`.
- **Validierung:** Bean Validation auf den Request-Records (`@NotBlank`, `@Email`, …).
  Fehler kommen gesammelt als `fields`.
- **Rate-Limiting:** 20 Anfragen/min auf `/api/auth/**` pro IP, 600/min sonst pro Nutzer.
  Header `X-RateLimit-*`, bei Überschreitung 429.
- **Korrelation:** `RequestIdFilter` gibt jeder Anfrage eine ID (`X-Request-Id`), die in jeder Logzeile steht.
- **Observability:** Actuator (`/actuator/health` mit DB, Redis, Elasticsearch), Prometheus-Metriken,
  eigene Zähler `quiz.answers`, `ingestion.observations.published`, Timer `worldbank.fetch`.
  `GET /api/admin/overview` zeigt Datenbestände und den **Kafka-Consumer-Lag**.
- **Resilienz:** `@Retryable` (Spring Framework 7) für die Weltbank, Timeouts am HTTP-Client.
- **Virtuelle Threads:** `spring.threads.virtual.enabled=true` – blockierende Aufrufe (HTTP, JDBC)
  kosten keine Plattform-Threads.

---

## 7. Tests

| Art | Dateien | Was sie zeigen |
| --- | --- | --- |
| Unit | `ScoringTest`, `GeoTest`, `QuestionGeneratorTest`, `WorldBankClientTest`, `LeaderboardKeyTest` | reine Logik, deterministisch durch festen Zufalls-Seed |
| Integration | `*IT` + `support/IntegrationTest`, `support/TestcontainersConfig` | ganze Anwendung gegen echte PostgreSQL-, Redis-, Kafka- und Elasticsearch-Container |

`@ServiceConnection` verbindet die Container automatisch mit Spring Boot. Nur die Weltbank wird
gemockt (`@MockitoBean`). Asynchrones (Kafka → Elasticsearch) wird mit Awaitility abgewartet.

---

## 8. Bewusste Vereinfachungen (gute nächste Lernschritte)

1. **Transactional Outbox:** Stirbt der Prozess zwischen Commit und Kafka-Versand, geht ein Event
   verloren. Lösung: Events in eine Outbox-Tabelle schreiben (gleiche Transaktion) und von dort senden.
2. **Spiel-Timer** laufen in der Instanz, die das Spiel gestartet hat. Für echte Ausfallsicherheit:
   Rundenenden als Redis-Sorted-Set (Zeitpunkt = Score) von allen Instanzen abarbeiten lassen.
3. **Refresh-Token im `localStorage`** ist anfällig für XSS. Sicherer: `HttpOnly`-Cookie.
4. **Ein Elasticsearch-Knoten, ein Kafka-Broker** – Replikation fehlt bewusst.
5. **Kein Index-Aliasing:** Ein Neuaufbau des Länder-Index löscht kurz alle Dokumente. Besser: neuen
   Index aufbauen und den Alias atomar umschalten.

---

## 9. Empfohlene Lesereihenfolge

1. `WorldExplorerApplication` und `application.yml` – was ist eingeschaltet?
2. `common/security/SecurityConfig` + `auth/*` – wer darf was?
3. `country/*` – ein einfaches Modul von Controller bis Entity.
4. `atlas/AtlasService` – JPA, Validierung, Optimistic Locking, Events.
5. `common/events/*` + `search/NoteIndexer` – wie Events fließen.
6. `indicator/*` – die Pipeline mit Kafka und das analytische SQL.
7. `quiz/engine/*` → `quiz/QuizService` → `quiz/LeaderboardService` – Spiellogik und Redis.
8. `multiplayer/*` – WebSocket, Zustandsautomat, Pub/Sub.
9. `activity/*` – Elasticsearch-Aggregationen und Betriebsübersicht.
10. `src/test/java/**` – wie man das alles automatisiert prüft.
