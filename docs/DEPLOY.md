# World Explorer – Deployment (öffentlicher Link)

Ziel: die komplette App (Frontend, Backend, PostgreSQL, Redis, Kafka, Elasticsearch) auf **einem** Server
betreiben, erreichbar unter einer Domain mit HTTPS. Alles Nötige liegt in [`deploy/`](../deploy).

```
Internet ──443──▶ Caddy (Container "web")
                    ├─ /             → statische Dateien des Frontends (dist/)
                    ├─ /api, /ws     → Spring-Boot-Backend (Container "backend")
                    └─ automatisches HTTPS-Zertifikat (Let's Encrypt)
                  Backend ──intern──▶ PostgreSQL · Redis · Kafka · Elasticsearch
```

Nur Caddy hat offene Ports (80/443). Datenbanken, Redis, Kafka und Elasticsearch sind von außen nicht
erreichbar. Weil Frontend und API unter **derselben Domain** laufen, braucht es kein CORS, und der
Refresh-Token-Cookie (`SameSite=Strict`, `HttpOnly`, `Secure`) funktioniert ohne Tricks.

## Was du brauchst

- Einen Linux-Server (VPS) mit **mindestens 4 GB RAM** (Elasticsearch, Kafka und das Backend sind
  speicherhungrig) und Docker + Docker Compose. Ein Hetzner-CX22 o. Ä. reicht.
- Eine Domain, deren **A-Record** auf die Server-IP zeigt.
- Optional einen SMTP-Zugang für E-Mails (Bestätigung, Passwort vergessen). Ohne SMTP werden die Mails
  nur ins Backend-Log geschrieben – Registrierung geht trotzdem, man sieht die Links dann im Log.

## Schritt für Schritt

```bash
git clone https://github.com/lorenzo689/World-Atlas.git && cd World-Atlas
cp deploy/.env.example deploy/.env
```

`deploy/.env` ausfüllen:

| Variable | Bedeutung |
| --- | --- |
| `SITE_ADDRESS` | deine Domain, z. B. `explorer.example.com` (Caddy holt das Zertifikat selbst). `:80` = nur HTTP, z. B. zum Testen im LAN |
| `PUBLIC_URL` | dieselbe Adresse mit Schema, `https://explorer.example.com` – kommt in die E-Mail-Links und in die WebSocket-Origin-Prüfung |
| `APP_JWT_SECRET` | geheimer Schlüssel für die Access-Tokens: `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | frei wählen |
| `APP_ADMIN_EMAILS` | wer sich mit dieser Adresse registriert, wird Admin (danach geht es auch über die Admin-Seite) |
| `SPRING_MAIL_*`, `APP_AUTH_MAIL_FROM` | SMTP-Zugang |

Starten:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f backend     # Startfortschritt
```

Der erste Start dauert einige Minuten (Images bauen, Backend startet, lädt die Weltbank-Daten).
Danach: `https://deine-domain` öffnen, ein Konto anlegen, die E-Mail bestätigen.

## Fertige Images statt Bauen auf dem Server

Der Workflow [`publish-images.yml`](../.github/workflows/publish-images.yml) baut beide Images und lädt sie in die
GitHub Container Registry. Er läuft **nur**, wenn du einen Tag wie `v1.0.0` pushst oder ihn auf GitHub
unter *Actions → Publish images → Run workflow* startest – nie bei jedem Push.

```bash
# in deploy/.env
BACKEND_IMAGE=ghcr.io/lorenzo689/world-explorer-backend:latest
WEB_IMAGE=ghcr.io/lorenzo689/world-explorer-web:latest
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d
```

(Pakete sind zunächst privat; entweder auf dem Server mit `docker login ghcr.io` anmelden oder das
Paket in den GitHub-Einstellungen öffentlich machen.)

## Betrieb

| Aufgabe | Befehl |
| --- | --- |
| Aktualisieren | `git pull && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build` |
| Logs (JSON/ECS-Format im Prod-Profil) | `docker compose -f deploy/docker-compose.prod.yml logs -f backend` |
| Datenbank sichern | `docker compose -f deploy/docker-compose.prod.yml exec postgres pg_dump -U worldexplorer worldexplorer > backup.sql` |
| Health | `https://deine-domain/api/health` |

Redis, Kafka und Elasticsearch enthalten nur Daten, die sich aus PostgreSQL bzw. den Kafka-Events
wieder aufbauen lassen – **PostgreSQL ist das einzige Backup, das zählt.**

## Kostenlose Alternative zum Ausprobieren

Wer keinen Server will, kann den Stack lokal starten und mit einem Tunnel öffentlich machen:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build   # SITE_ADDRESS=:80
cloudflared tunnel --url http://localhost:80          # oder: ngrok http 80
```

Dann `PUBLIC_URL` auf die Tunnel-Adresse setzen (`https://….trycloudflare.com`), damit die Links in den
E-Mails und die WebSocket-Prüfung stimmen.

## Beobachtbarkeit (optional, lokal)

```bash
docker compose --profile monitoring up -d     # Prometheus :9090, Grafana :3000 (Dashboard "World Explorer"), Jaeger :16686
cd backend && SPRING_PROFILES_ACTIVE=tracing ./mvnw spring-boot:run     # Traces nach Jaeger
```

Das Grafana-Dashboard (`monitoring/grafana/dashboards/world-explorer.json`) zeigt Anfragen/s, Latenz-Perzentile,
Fehlerrate, JVM, Kafka-Lag, Outbox-Rückstand, Quiz-Antworten und Cache-Treffer.
