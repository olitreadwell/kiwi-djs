# Project context — Kiwi DJs

Read this first. It is the live handoff for any new session working on this repo.

## What this is

Open directory + dataset of New Zealand (Aotearoa) DJs. Public data only. Users look up a DJ and get a full dossier: summary, mixes (SoundCloud/Mixcloud), news articles, socials, played-with artists, labels/promoters, upcoming + past gigs, and similar DJs. The dataset is also a standalone OpenAPI/Swagger-compliant product for reuse.

## Stack & infra

- Next.js 16 (App Router) + TypeScript + Tailwind v4, `pg` for Postgres, Vercel deploy
- Local DB: docker container `wellington-djs-db`, port 5433 (legacy naming; kept until the Neon managed DB is live)
  - `postgres://wellington_djs:wellington_djs_dev@localhost:5433/wellington_djs`
- Live: https://kiwi-djs.vercel.app · Repo: https://github.com/olitreadwell/kiwi-djs
- Prod runs in **snapshot mode** (serves `src/data/snapshot.json`) until a managed DB is added — Vercel CLI refuses AI-agent term acceptance, so a human must run `vercel integration add supabase` and set `DATABASE_URL`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | dev server (port 3001 if 3000 busy) |
| `pnpm check` | lint + typecheck + build |
| `pnpm db:setup` | migrate + seed |
| `pnpm db:snapshot` | regenerate `src/data/snapshot.json` (needed after schema/data changes) |
| `pnpm scrape` | run all scrapers + discovery + enrichment once |
| `pnpm loop` | self-improving loop: issues phase (fix open automatable dataset issues) ↔ scrape phase (compact → scrape → verify → snapshot → commit → push), backing off 5/10/15/30/60 min as data thins |
| `pnpm contract` | contract test vs running server (`BASE_URL=http://localhost:3001`) |

## Architecture

- `src/lib/scrapers/` — one file per source. `run-all.ts` orchestrates: sources → `discoverAll` → `enrichAllDjs` → `verifyDiscovered` (second pass promotes same-cycle candidates)
- Enrichment covers active DJs first, then top candidates (by `verification_level`, then `data_completeness`); junk-marker candidates excluded
- `src/lib/queries.ts` — data-access facade; picks `PostgresRepo` or `SnapshotRepo` via `isDbMode`
- `src/lib/repo/` — `types.ts` (row types + `DataRepository` interface), `postgres.ts` (SQL), `snapshot.ts` (snapshot.json)
- `src/lib/schemas.ts` — Zod schemas: API responses generate the OpenAPI components; query params are validated at the route boundary (400 on invalid input)

## Data pipeline

ingest → normalize → dedupe → enrich → verify → publish:

- **Ingest**: `src/lib/scrapers/` (one file per source) writes raw facts via `upsert.ts`
- **Normalize**: `normaliseGenres` (`src/lib/genres.ts`), `normalizeArtistName`/`isJunkName` (`scrapers/discover.ts`), `cityFromLocation` (`src/lib/locations.ts`)
- **Dedupe**: slug ids + `ON CONFLICT` upserts; duplicate-merge issues run as dataset fixes in the loop
- **Enrich**: `enrichAllDjs` (`scrapers/enrich.ts`) + source-specific enrichment (official-site bios, Beatport genres, Wayback archiving)
- **Verify**: `verifyDiscovered` (`scrapers/discover.ts`) — multi-source corroboration; non-NZ profiles demoted (`#321`)
- **Publish**: `export-snapshot.mjs` → `src/data/snapshot.json`; public reads go through `queries.ts` (repo adapters)
- `src/lib/openapi.ts` — OpenAPI 3.1 spec (typed with `type-fest`); served at `/api/openapi.json`
- `src/lib/api-types.ts` — API response types + `toDjSummary`
- `src/app/api/v1/` — public API: `/djs`, `/djs/{id}`, `/events`, `/venues`, `/search`, `/dataset`, `/dataset.csv`
- `src/app/docs/` — Swagger UI (`/docs`, `/docs/swagger`)
- `db/schema.sql` — idempotent schema (djs, venues, events, scrapes, search_events, profile_views, changelog, dj_links, dj_articles, dj_mixes, dj_aliases)
- `scripts/` — migrate, seed, snapshot export, CLI scraper runner, contract test

## Data model rules

- `djs.active = FALSE` = unverified candidate (discovered from event names/Mixcloud). Public queries filter `active = TRUE`. `verify-discovered` promotes candidates that gain mixes/links/articles or co-bill with an active DJ.
- `djs.opt_out = TRUE` = DJ removed themselves. Every public query filters it.
- `data_completeness` (0-100) recalibrated (#140): mixes 30, gigs 20, bio 15, photo 10, links 10, articles 10, genres 5. Same formula in `src/lib/queries.ts`, `scripts/export-snapshot.mjs` and the stored column (recomputed by the loop's dataset fix).
- `djs.stale_since` set when a DJ's most recent dated activity (gig/article/mix discovery) is >12 months old (#138); cleared when activity resumes. `djs.bio_quality` = `low`/`ok` from the bio audit (#142).

## Loop phases

- **Issues phase** (default on start): each cycle audits ALL open GitHub issues into a priority + dependency-ordered queue (`.loop/queue.json`, built by `scripts/issue-queue.ts`), then works the top automatable dataset issue from `scripts/dataset-fixes.ts` (non-NZ location demote #262, duplicate merge #159/#193, stale flagging #138, junk cleanup #195, bio audit #142, completeness recalibration #140), closing it when its acceptance criteria are met. Non-automatable top issues are logged for the next agent session. One fix per cycle, 5-min backoff, max 6 cycles, then switches to the scrape phase.
- **Scrape phase**: compact → scrape → discover → enrich → verify → snapshot → commit → push. After a scrape cycle, if any automatable dataset issue is open, the loop switches back to the issues phase.
- Phase state lives in `.loop/phase.json`; the handoff file shows the current phase.
- Scrapers: robots.txt-checked, 500ms+ delays, 15s timeouts, failures recorded in `scrapes` table, never fatal.

## Feedback → issues (standing convention)

Every piece of user feedback becomes a GitHub issue, not just a one-off fix:

1. **Research first** — check whether it's a generic problem that applies across sources/venues/DJs (e.g. "Mark Knight shows cartoonist articles" → namesake disambiguation everywhere, not just news).
2. **Spec it** — Context / Research / Spec / Acceptance, with what a user probably wants to see.
3. **Label it** — priority (`P0`–`P3`) + persona (`persona: attendee` / `dj` / `promoter` / `researcher` / `nz-fan`).
4. **Fix it when the loop gets to it** — quick wins can be fixed immediately (and the issue closed with a reference), but the issue is the durable record; the loop's issues phase works the automatable ones by priority, and future sessions pick up the rest. It doesn't have to be the next thing done.

Recent feedback → issues: venue coverage gaps (#257), played-with graph completeness (#258), namesake disambiguation (#259), NZ-wide rough-list discovery (#260).

## Current state (2026-08-29)

- 8 active seed DJs (incl. Broderbeats), 59+ events, 171 mixes, 25 articles, 57 hidden discovery candidates
- Dossier live: summary, mixes, news, played-with, labels, past gigs, similar DJs
- API v1 + OpenAPI + Swagger + dataset export + contract test all passing
- **In progress:** final snapshot + commit + deploy + prod verification

## Gotchas

- `scripts/lib/db.mjs` keeps its own `slugify` — tsx cannot transform `.mjs` imports of `.ts` files. App code uses `src/lib/slug.ts`.
- Google News RSS is robots-blocked → news enrichment uses Bing News RSS only.
- SoundCloud default client id is dead (401). Needs fresh `SOUNDCLOUD_CLIENT_ID`.
- Mixcloud rate-limits under sustained load → enrichment capped at 30 DJs/run (`ENRICH_LIMIT`), Mixcloud at 20 (`MIXCLOUD_LIMIT`); genre-filling sources prioritise DJs that still need a specific subgenre.
- Vercel cron: `vercel.json` schedules `/api/cron/refresh` 2am NZT; route skips gracefully without `DATABASE_URL`.
- Self-improving loop: launchd agent `com.olitreadwell.kiwi-djs-loop` fires daily 4:30am NZT (16:30 UTC, DeepSeek off-peak start) and self-sustains via `pnpm loop`. Single-instance lock in `logs/loop.pid`; source health in `logs/source-state.json` (3 consecutive errors disables a source for 24h). Loop commits only `src/data/snapshot.json` — never sweeps WIP.

## Active goal

Build DJ dossier enrichment + new-DJ discovery scanner + OpenAPI/Swagger dataset product. Iterate every 20 minutes as a self-improving loop until complete, deployed, verified.
