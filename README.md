# Wellington DJs

Open directory of DJs in Wellington, NZ (Te Whanganui-a-Tara). Search DJs, browse bios/genres/socials, see upcoming gigs, discover who's moving the room. Data comes from public sources only, refreshed daily.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Postgres (Supabase / Neon / Vercel Postgres / local docker all work) via `pg`
- Scrapers: Node + cheerio + robots.txt checks, run by Vercel Cron
- Deployed on Vercel

## Quickstart

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL
pnpm db:setup                # migrate + seed
pnpm dev
```

Local Postgres (docker):

```bash
docker run -d --name wellington-djs-db \
  -e POSTGRES_PASSWORD=wellington_djs_dev -e POSTGRES_USER=wellington_djs \
  -e POSTGRES_DB=wellington_djs -p 5433:5432 postgres:16-alpine
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm lint` | eslint |
| `pnpm typecheck` | tsc |
| `pnpm db:setup` | migrate + seed |
| `pnpm db:snapshot` | export DB to `src/data/snapshot.json` (read-only fallback mode) |
| `pnpm scrape` | run all scrapers once |

## Data modes

- **Postgres mode**: `DATABASE_URL` set. Live data, scrapers, analytics, opt-out all active. Daily refresh via `POST /api/cron/refresh` (Vercel Cron, 2am NZT, `vercel.json`).
- **Snapshot mode**: no `DATABASE_URL`. Serves the committed `src/data/snapshot.json` read-only. Pages work; analytics/opt-out are no-ops. Regenerate with `pnpm db:snapshot`.

## API

- **Swagger UI**: `/docs` · **OpenAPI spec**: `/api/openapi.json`
- `GET /api/v1/djs` — list/search DJs (`q`, `genre`, `limit`, `offset`)
- `GET /api/v1/djs/{id}` — full dossier: summary, mixes, articles, socials, collabs, labels, similar DJs, upcoming + past gigs
- `GET /api/v1/events` — events (`upcoming`, `venue`, `dj`, `limit`)
- `GET /api/v1/venues` — venues
- `GET /api/v1/search?q=` — search DJs
- `GET /api/v1/dataset` — full dataset export (JSON) for reuse in other products
- `GET /api/v1/dataset.csv` — DJs as CSV
- `GET /health` — health check (reports mode + DJ count)
- `POST /api/search` — log a search `{ query }`
- `POST /api/djs/[id]/view` — log a profile view
- `POST /api/opt-out` — `{ djId }` hides a DJ from the directory
- `GET|POST /api/cron/refresh` — run all scrapers (protect with `CRON_SECRET`; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`)

Contract test keeps spec and server in agreement: `BASE_URL=http://localhost:3001 pnpm contract`.

## Ethics

- Public data only. No paywalls, no logins, no private content.
- Scrapers check `robots.txt`, rate-limit politely, and record every run in the `scrapes` table.
- Any DJ can remove themselves: `/opt-out`.

## Docs

- [DATA_SOURCES.md](DATA_SOURCES.md) — every source, status, and how to enable key-gated ones
- [SELF_IMPROVEMENT.md](SELF_IMPROVEMENT.md) — the feedback loop
- [CHANGELOG.md](CHANGELOG.md) — what changed, week by week
