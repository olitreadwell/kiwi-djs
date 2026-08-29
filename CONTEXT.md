# Project context — Aotearoa NZ DJs

Read this first. It is the live handoff for any new session working on this repo.

## What this is

Open directory + dataset of Wellington (Te Whanganui-a-Tara) DJs. Public data only. Users look up a DJ and get a full dossier: summary, mixes (SoundCloud/Mixcloud), news articles, socials, played-with artists, labels/promoters, upcoming + past gigs, and similar DJs. The dataset is also a standalone OpenAPI/Swagger-compliant product for reuse.

## Stack & infra

- Next.js 16 (App Router) + TypeScript + Tailwind v4, `pg` for Postgres, Vercel deploy
- Local DB: docker container `wellington-djs-db`, port 5433
  - `postgres://wellington_djs:wellington_djs_dev@localhost:5433/wellington_djs`
- Live: https://nz-djs.vercel.app · Repo: https://github.com/olitreadwell/nz-djs
- Prod runs in **snapshot mode** (serves `src/data/snapshot.json`) until a managed DB is added — Vercel CLI refuses AI-agent term acceptance, so a human must run `vercel integration add supabase` and set `DATABASE_URL`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | dev server (port 3001 if 3000 busy) |
| `pnpm check` | lint + typecheck + build |
| `pnpm db:setup` | migrate + seed |
| `pnpm db:snapshot` | regenerate `src/data/snapshot.json` (needed after schema/data changes) |
| `pnpm scrape` | run all scrapers + discovery + enrichment once |
| `pnpm loop` | self-improving loop: compact → scrape → verify → snapshot → commit → push, backing off 5/10/15/30/60 min as data thins |
| `pnpm contract` | contract test vs running server (`BASE_URL=http://localhost:3001`) |

## Architecture

- `src/lib/scrapers/` — one file per source. `run-all.ts` orchestrates: sources → `discoverAll` → `enrichAllDjs` → `verifyDiscovered` (second pass promotes same-cycle candidates)
- Enrichment covers active DJs first, then top candidates (by `verification_level`, then `data_completeness`); junk-marker candidates excluded
- `src/lib/queries.ts` — all data access; branches DB vs snapshot mode via `isDbMode`
- `src/lib/openapi.ts` — OpenAPI 3.1 spec (typed with `type-fest`); served at `/api/openapi.json`
- `src/lib/api-types.ts` — API response types + `toDjSummary`
- `src/app/api/v1/` — public API: `/djs`, `/djs/{id}`, `/events`, `/venues`, `/search`, `/dataset`, `/dataset.csv`
- `src/app/docs/` — Swagger UI (`/docs`, `/docs/swagger`)
- `db/schema.sql` — idempotent schema (djs, venues, events, scrapes, search_events, profile_views, changelog, dj_links, dj_articles, dj_mixes, dj_aliases)
- `scripts/` — migrate, seed, snapshot export, CLI scraper runner, contract test

## Data model rules

- `djs.active = FALSE` = unverified candidate (discovered from event names/Mixcloud). Public queries filter `active = TRUE`. `verify-discovered` promotes candidates that gain mixes/links/articles or co-bill with an active DJ.
- `djs.opt_out = TRUE` = DJ removed themselves. Every public query filters it.
- `data_completeness` (0-100) computed from filled fields; drives the "needs more data" section.
- Scrapers: robots.txt-checked, 500ms+ delays, 15s timeouts, failures recorded in `scrapes` table, never fatal.

## Current state (2026-08-29)

- 8 active seed DJs (incl. Broderbeats), 59+ events, 171 mixes, 25 articles, 57 hidden discovery candidates
- Dossier live: summary, mixes, news, played-with, labels, past gigs, similar DJs
- API v1 + OpenAPI + Swagger + dataset export + contract test all passing
- **In progress:** final snapshot + commit + deploy + prod verification

## Gotchas

- `scripts/lib/db.mjs` keeps its own `slugify` — tsx cannot transform `.mjs` imports of `.ts` files. App code uses `src/lib/slug.ts`.
- Google News RSS is robots-blocked → news enrichment uses Bing News RSS only.
- SoundCloud default client id is dead (401). Needs fresh `SOUNDCLOUD_CLIENT_ID`.
- Mixcloud rate-limits under sustained load → enrichment capped at 15 active DJs/run.
- Vercel cron: `vercel.json` schedules `/api/cron/refresh` 2am NZT; route skips gracefully without `DATABASE_URL`.
- Self-improving loop: launchd agent `com.olitreadwell.aotearoa-djs-loop` fires daily 4:30am NZT (16:30 UTC, DeepSeek off-peak start) and self-sustains via `pnpm loop`. Single-instance lock in `logs/loop.pid`; source health in `logs/source-state.json` (3 consecutive errors disables a source for 24h). Loop commits only `src/data/snapshot.json` — never sweeps WIP.

## Active goal

Build DJ dossier enrichment + new-DJ discovery scanner + OpenAPI/Swagger dataset product. Iterate every 20 minutes as a self-improving loop until complete, deployed, verified.
