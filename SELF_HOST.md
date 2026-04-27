# Self-hosting Aloy

Aloy ships as a single Hono service backed by Postgres. There is no ClickHouse, no separate ingestion daemon, no message broker. The only thing you need is Docker and a place to put a Postgres data volume.

## TL;DR — `docker compose up`

```bash
git clone https://github.com/noelschwarz/aloy.git
cd aloy
cp .env.example .env       # optional: edit env vars first
docker compose up
```

Postgres listens on `:5432`, the API on `:3000`. The `aloy_pgdata` named volume persists across restarts. The API service has a `/health` healthcheck and waits for Postgres before booting.

Verify:

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0"}
```

## Environment variables

All configuration is via env vars. See [`.env.example`](.env.example) for the canonical list.

| Variable                 | Default                                              | Description                                                                                                          |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://aloy:aloy@localhost:5432/aloy`         | Postgres connection string. The compose file injects the in-network host (`postgres`) automatically.                 |
| `USE_DB_AUTHENTICATION`  | `false`                                              | When `false`, the API is open. Set `true` in any environment reachable beyond your laptop.                           |
| `LOG_LEVEL`              | `info`                                               | One of `debug`, `info`, `warn`, `error`.                                                                              |
| `CORS_ORIGINS`           | `*`                                                  | Comma-separated allowed origins. Use `*` only in local dev.                                                           |
| `PORT`                   | `3000`                                               | HTTP port. Match this with whatever you publish in `docker-compose.yaml`.                                             |

## Manual / non-Docker

```bash
# 1. Start Postgres 15 somehow.
# 2. From the repo root:
pnpm install
pnpm --filter aloy build
pnpm --filter @aloy/api build
DATABASE_URL=postgresql://aloy:aloy@localhost:5432/aloy \
  node apps/api/dist/index.js
```

The API server runs migrations automatically on startup, so first-run is the same as nth-run.

## Managing API keys

When `USE_DB_AUTHENTICATION=true`, every request to `/v1/*` must carry `Authorization: Bearer aloy_…`. Generate a key with the admin CLI:

```bash
docker compose exec api node dist/cli.js keys create --name "my-laptop"
```

The full key is printed once. We store only its bcrypt hash (cost 12) plus a 16-char prefix for fast lookup. Subsequent commands:

```bash
docker compose exec api node dist/cli.js keys list
docker compose exec api node dist/cli.js keys revoke aloy_live_xXxXxX
```

## Querying events

The API is the user surface for v0.1. The dashboard is sprint 2.

```bash
# All events for project "default", newest first.
curl 'http://localhost:3000/v1/events?project=default&limit=50'

# Cursor-paginate.
curl 'http://localhost:3000/v1/events?project=default&limit=50&beforeId=evt_…'
```

## Upgrades

Aloy migrations are managed by Drizzle Kit and embedded in the API binary. To upgrade:

```bash
git pull
docker compose up --build -d
```

The API runs `migrate(...)` on boot, so a fresh image is enough.

## Backups

Postgres data lives in the `aloy_pgdata` named volume.

```bash
docker compose exec postgres pg_dump -U aloy -d aloy --format=custom > aloy.dump
```

Restore with `pg_restore`. We will document a more rigorous backup story once anyone asks.
