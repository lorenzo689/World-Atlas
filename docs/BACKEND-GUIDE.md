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
 Vite-Dev-Server bzw. Caddy (Proxy: /api und /ws gehen ans Backend)
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
- **Admin-Konto:** einfach mit `admin@worldexplorer.dev` registrieren (siehe `app.admin-emails`); weitere
  Admins vergibt man auf der Seite `/admin` (Rollen liegen in der Datenbank).
- **E-Mails in der Entwicklung:** landen im Dev-Postfach `GET /api/dev/mails` (und im Log); mit
  `docker compose --profile tools up -d` fängt Mailpit (http://localhost:8026) echte SMTP-Mails ab.
- **Monitoring:** `docker compose --profile monitoring up -d` → Grafana http://localhost:3000 (Dashboard
  „World Explorer“), Prometheus :9090, Jaeger :16686. Traces: Backend mit `SPRING_PROFILES_ACTIVE=tracing` starten.
- **Profile:** `tracing` (OTLP-Export), `json-logs` (strukturierte ECS-Logs), `prod` (Cookie `Secure`, Dev-Postfach aus, 10 % Tracing).
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
| `auth` | Registrierung, Login, Gäste, Refresh-Cookie, E-Mail-Bestätigung, Passwort vergessen, Rollenverwaltung | `AuthService`, `TokenService`, `OneTimeTokens`, `mail/Mailer` |
| `indicator` | **Daten-Plattform**: Ingestion-Pipeline + Analyse-API | `IngestionService`, `IndicatorValueRepository` |
| `search` | Elasticsearch-Dokumente, Indexer, Suche | `SearchService`, `CountryDocument` |
| `atlas` | **Persönlicher Atlas**: Favoriten, Reiselog, Notizen, gespeicherte Ansichten | `AtlasService` |
| `quiz` | **Geo-Quiz**: Fragen, Bewertung, Daily Challenge, Leaderboards, Statistik | `QuizService`, `quiz/engine/*` |
| `multiplayer` | **Echtzeit-Spiel** über WebSocket, Matchmaking | `RoomService`, `WebSocketConfig` |
| `achievement` | 18 Abzeichen, Tagesserie, Wissensstand je Region (aus Kafka-Events) | `AchievementService`, `Achievement` |
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

### 4.2 Redis – zehn Verwendungen

| Verwendung | Datenstruktur | Datei |
| --- | --- | --- |
| Cache (`@Cacheable`) | String (JSON) mit TTL | `CacheConfig`, `CountryService`, `IndicatorQueryService` |
| Refresh-Tokens | String `refresh:<sha256>` → userId, TTL 14 Tage; Set `user-refresh:<id>` für „überall abmelden“ | `TokenService` |
| Einmal-Tokens (E-Mail-Link) | String `ott:<zweck>:<sha256>`, `GETDEL` (einmal einlösbar) | `OneTimeTokens` |
| Spiel-Timer (Multiplayer) | **Sorted Set** `mp:timers` (Score = Fälligkeit) + Lease-Set, Lua-Skripte | `GameTimers` |
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
| `atlas.changed` | 3 | Favorit/Reise/Notiz/Ansicht geändert | `note-indexer`, `achievements`, `activity-indexer` |
| `quiz.completed` | 3 | Quiz beendet, mit allen Antworten | `player-stats`, `achievements`, `activity-indexer` |
| `multiplayer.finished` | 3 | Spiel beendet, mit Platzierungen | `player-stats`, `achievements`, `activity-indexer` |
| `achievement.unlocked` | 3 | Abzeichen freigeschaltet | `achievement-notifier` (WebSocket-Push), `activity-indexer` |
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
- **Transactional Outbox.** `EventPublisher` schreibt Events in die Tabelle `outbox_event` – **in derselben
  Transaktion** wie die Fachänderung. Der `OutboxRelay` (alle 300 ms, `FOR UPDATE SKIP LOCKED`, damit mehrere
  Instanzen sich nicht in die Quere kommen) liest ungesendete Zeilen, schickt sie nach Kafka und markiert sie.
  Wird die Transaktion zurückgerollt, existiert auch kein Event; stirbt der Prozess nach dem Commit, geht das
  Event nicht verloren, sondern wird beim nächsten Lauf gesendet (mindestens einmal – daher die idempotenten
  Konsumenten). Der Rückstand ist als Metrik `outbox.pending` sichtbar.
- **Idempotente Konsumenten.** Kafka liefert „mindestens einmal“. `IdempotencyGuard` merkt sich
  verarbeitete Event-IDs in `processed_event` – in derselben Transaktion wie die eigentliche Änderung.

### 4.4 Elasticsearch – Suche und Analytik

| Index | Dokument | Wofür |
| --- | --- | --- |
| `countries` (Alias → `countries-<zeitstempel>`) | `CountryDocument` | Suche mit Tippfehlern, Präfixen, Akzenten; Geo-Distanz. **Neuaufbau ohne Ausfall:** `CountryIndexer` baut einen neuen Index, befüllt ihn und schaltet den Alias atomar um (Add + Remove in einer Aktion), dann wird der alte Index gelöscht |
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

### 5.1 Anmeldung, Refresh-Cookie, E-Mail-Bestätigung

1. `POST /api/auth/login` → `AuthController` → `AuthService.login` prüft das Passwort mit BCrypt.
   (Bei unbekannter E-Mail wird gegen einen Dummy-Hash geprüft, damit die Antwortzeit nichts verrät.)
2. `TokenService.issue` erzeugt
   - ein **Access-Token** (JWT, HS256, 15 min) mit `sub`, `name`, `roles`, `guest`, `email_verified`.
     Die Antwort enthält es im Body; das Frontend hält es **nur im Speicher**.
   - ein **Refresh-Token** (zufällig, 256 Bit). In Redis liegt nur sein SHA-256-Hash. Es wird als
     **`HttpOnly`-Cookie** `we_refresh` gesetzt (`SameSite=Strict`, `Path=/api/auth`, `Secure` in Produktion) –
     JavaScript kann es nicht lesen, ein XSS-Fehler kann die Sitzung also nicht stehlen.
3. Jede Anfrage schickt `Authorization: Bearer <jwt>`. Spring Security prüft Signatur, Ablauf und Aussteller
   (`JwtConfig`) – ohne Datenbankzugriff.
4. Läuft das Access-Token ab (oder nach einem Seiten-Reload), ruft das Frontend `POST /api/auth/refresh` –
   der Browser schickt das Cookie von selbst mit (`src/lib/api.ts`, „single flight“: zehn parallele 401er lösen
   nur **einen** Refresh aus). Das alte Refresh-Token wird gelöscht (**Rotation**).
5. `POST /api/auth/logout` löscht Cookie und Token; Passwort zurücksetzen entzieht **alle** Sitzungen
   (`TokenService.revokeAll` über das Set `user-refresh:<id>`).

**E-Mail-Bestätigung und „Passwort vergessen“** nutzen dieselben Einmal-Links (`OneTimeTokens`):
ein Zufallstoken, in Redis nur als Hash, mit `GETDEL` genau einmal einlösbar, in der Mail als Link
(`/verify?token=…`, `/reset-password?token=…`). `forgot-password` antwortet **immer** mit 202, damit niemand
herausfinden kann, welche Adressen ein Konto haben. Der `Mailer` sendet per SMTP, sonst ins Log/Dev-Postfach.

Rollen: `GUEST` (Spitzname, darf spielen), `USER` (Konto, darf den Atlas nutzen), `ADMIN`. Admins werden über
die Seite `/admin` verwaltet (`PUT /api/admin/users/{id}/roles`, man kann sich nicht selbst degradieren); die
E-Mail-Liste `app.admin-emails` dient nur noch als Start-Admin. Die Regeln stehen zentral in `SecurityConfig`.

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

**Neutrale Antwort-IDs:** Die Optionen heißen `A`–`D`, nicht wie das Land (`DEU`). Sonst ließe sich bei der
Hauptstadt-Frage aus der ID die Antwort ablesen. Nur wo das Bild das Land ohnehin zeigt (Flaggen, Einwohner)
liefert `Option.code` den Ländercode, damit das Frontend den Namen in der UI-Sprache anzeigen kann.

**Duelle:** `POST /api/challenges` erzeugt einen Link (`slug`) mit festem Zufalls-**Seed**. Wer den Link öffnet,
bekommt exakt dieselben Fragen (`QuizMode.CHALLENGE`, ein Versuch pro Nutzer über `SET NX` in Redis). Die
Rangliste des Duells (`rank() over (order by score desc, duration_ms asc)`) ist öffentlich lesbar.

### 5.3a Abzeichen

`AchievementService` hört (Consumer Group `achievements`) auf `quiz.completed`, `multiplayer.finished` und
`atlas.changed`, aktualisiert `player_country_stats` (welches Land wie oft richtig) und die Tagesserie
(ein einziges Upsert-SQL mit `returning current_streak`), prüft die 18 Regeln aus `Achievement` und
veröffentlicht für jedes neue Abzeichen `AchievementUnlocked`. `AchievementNotifier` schickt das per STOMP an
`/user/queue/notifications` – im Browser erscheint ein Toast (`Notifications.tsx`).

### 5.4 Eine Multiplayer-Runde

```
Host: POST /api/rooms/{code}/start
  RoomService.start → Fragen erzeugen, Status RUNNING
  → Broadcast GAME_STARTING; GameTimers.schedule(START_ROUND, in 3 s)
GameTimers (jede Instanz, alle 100 ms): fällige Einträge atomar „claimen“ → RoomService.startRound(n)
  Frage öffnen, endsAt setzen → Broadcast ROUND_STARTED; schedule(END_ROUND, endsAt)
Spieler: STOMP SEND /app/rooms/{code}/answer  → RoomMessagingController → RoomService.answer
  (alle verbundenen Spieler geantwortet? → endRound sofort)
endRound(n): Punkte gutschreiben → Broadcast ROUND_ENDED; schedule(START_ROUND n+1) oder FINISH
finish: Status FINISHED → Broadcast GAME_FINISHED; Ergebnis in PostgreSQL; Event multiplayer.finished
```

- **Timer ohne „Besitzer-Instanz“.** Früher lief jeder Timer in der Instanz, die das Spiel gestartet hat –
  stürzt sie ab, hängt das Spiel. Jetzt liegen alle Timer in einem Redis-**Sorted Set** (`mp:timers`, Score =
  Fälligkeitszeit, Member = `AKTION|raum|runde|spiel`). Jede Instanz fragt alle 100 ms per Lua-Skript ab:
  „gib mir fällige Einträge und verschiebe sie atomar in `mp:timers:inflight` mit 15 s Lease“. Wer den Eintrag
  bekommt, führt ihn aus und bestätigt. Stürzt er dabei ab, läuft die Lease ab und ein **Recover-Skript**
  legt den Eintrag zurück in die Warteschlange – eine andere Instanz übernimmt. Die Aktionen sind idempotent
  (eine schon beendete Runde wird nicht zweimal beendet).
- **Jede Änderung** folgt dem Muster *Lock → Laden → Prüfen → Ändern → Speichern → Senden*
  (`RoomService.mutate`).
- **Broadcast über Redis Pub/Sub:** `RoomBroadcaster` veröffentlicht, `RedisWebSocketRelay` empfängt
  auf *jeder* Instanz und leitet an die lokalen WebSocket-Verbindungen weiter. So funktioniert das
  Spiel auch, wenn die Spieler mit verschiedenen Backend-Instanzen verbunden sind.
- **Authentifizierung:** Browser können beim WebSocket-Handshake keine Header setzen. Das JWT steht
  deshalb im STOMP-`CONNECT`-Frame und wird in `JwtChannelInterceptor` geprüft.
- **Live-Marker:** Bei „Wo liegt …?“-Fragen zeigt der Globus nach der Runde, wo jeder Spieler hingeklickt hat
  (Farbe pro Spieler, `GlobeView.markers`).

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
- **Korrelation:** `RequestIdFilter` gibt jeder Anfrage eine ID (`X-Request-Id`), die in jeder Logzeile steht – zusammen mit der **Trace-ID**.
- **Observability:** Actuator (`/actuator/health` mit DB, Redis, Elasticsearch), Prometheus-Metriken,
  eigene Zähler `quiz.answers`, `ingestion.observations.published`, Timer `worldbank.fetch`.
  `GET /api/admin/overview` zeigt Datenbestände und den **Kafka-Consumer-Lag**.
- **Verteiltes Tracing:** `spring-boot-starter-opentelemetry` + Micrometer Tracing. Der Trace-Kontext reist in
  den Kafka-Headern (Producer **und** Consumer beobachtet), ein Trace geht also über HTTP → Outbox →
  Kafka → Consumer. Export per OTLP an Jaeger (Profil `tracing`).
- **Dashboards:** Prometheus scrapt `/actuator/prometheus`; das vorkonfigurierte Grafana-Dashboard
  (`monitoring/grafana/dashboards/world-explorer.json`) zeigt Anfragen, p50/p95/p99, Fehlerrate, JVM, Hikari,
  Kafka-Lag, Outbox, Quiz.
- **Strukturierte Logs:** Profil `json-logs`/`prod` schaltet Spring Boots ECS-JSON-Format ein.
- **Lasttest:** `loadtest/quiz.js` (k6) spielt komplette Quizze und liest die gecachten Daten-Endpunkte.
- **Resilienz:** `@Retryable` (Spring Framework 7) für die Weltbank, Timeouts am HTTP-Client.
- **Virtuelle Threads:** `spring.threads.virtual.enabled=true` – blockierende Aufrufe (HTTP, JDBC)
  kosten keine Plattform-Threads.

---

## 7. Tests

| Art | Dateien | Was sie zeigen |
| --- | --- | --- |
| Unit | `ScoringTest`, `GeoTest`, `QuestionGeneratorTest`, `WorldBankClientTest`, `LeaderboardKeyTest` | reine Logik, deterministisch durch festen Zufalls-Seed |
| Integration | `*IT` + `support/IntegrationTest`, `support/TestcontainersConfig` | ganze Anwendung gegen echte PostgreSQL-, Redis-, Kafka- und Elasticsearch-Container |

Neu: `ChallengeAndAchievementIT` (Duell, Abzeichen über Kafka, Outbox-Relay), erweiterte `AuthAndAtlasIT`
(Cookie-Refresh, E-Mail-Bestätigung, Passwort-Reset, Rollenverwaltung). Im Frontend: `vitest`-Tests für API-Client,
i18n, QuestionPanel und Login; `npm run e2e` spielt die ganze App im Browser durch.

`@ServiceConnection` verbindet die Container automatisch mit Spring Boot. Nur die Weltbank wird
gemockt (`@MockitoBean`). Asynchrones (Kafka → Elasticsearch) wird mit Awaitility abgewartet.

---

## 8. Bewusste Vereinfachungen (gute nächste Lernschritte)

Erledigt seit der ersten Version: Transactional Outbox, verteilte Spiel-Timer, Refresh-Token als
`HttpOnly`-Cookie, Index-Alias für den Länder-Index.

1. **Ein Elasticsearch-Knoten, ein Kafka-Broker, eine PostgreSQL-Instanz** – Replikation fehlt bewusst.
   Nächster Schritt: Kafka mit 3 Brokern und `replication.factor=3`, PostgreSQL mit Replik.
2. **Outbox-Relay pollt** (300 ms). Eleganter, aber aufwendiger: Change Data Capture mit Debezium.
3. **Kein Schema-Register** für die Kafka-Events (Jackson-JSON mit Typ-Header). Avro/Protobuf + Schema Registry
   würde Schema-Evolution absichern.
4. **Rate-Limits pro IP** hinter einem Proxy hängen an `X-Forwarded-For` (`forward-headers-strategy: framework`
   im Prod-Profil) – ein falsch konfigurierter Proxy lässt sich so umgehen.
5. **Keine Mehrmandantenfähigkeit/Datenschutz-Export:** „Konto löschen“ und „Daten exportieren“ fehlen noch.

---

## 9. Empfohlene Lesereihenfolge

1. `WorldExplorerApplication` und `application.yml` – was ist eingeschaltet?
2. `common/security/SecurityConfig` + `auth/*` – wer darf was?
3. `country/*` – ein einfaches Modul von Controller bis Entity.
4. `atlas/AtlasService` – JPA, Validierung, Optimistic Locking, Events.
5. `common/events/*` + `search/NoteIndexer` – wie Events fließen.
6. `indicator/*` – die Pipeline mit Kafka und das analytische SQL.
7. `quiz/engine/*` → `quiz/QuizService` → `quiz/LeaderboardService` – Spiellogik und Redis.
8. `multiplayer/*` – WebSocket, Zustandsautomat, Pub/Sub, `GameTimers` (verteilte Timer).
8a. `common/events/OutboxRelay` + `achievement/*` – verlässliche Events und was man damit baut.
9. `activity/*` – Elasticsearch-Aggregationen und Betriebsübersicht.
10. `src/test/java/**` – wie man das alles automatisiert prüft.
