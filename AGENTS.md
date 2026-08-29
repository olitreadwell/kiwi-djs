# AGENTS.md

> **Read `CONTEXT.md` first** — it is the live project handoff: current state, active goal, in-progress work, gotchas.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm db:setup` — migrate + seed local DB
- `pnpm scrape` — run all scrapers once
- `pnpm db:snapshot` — regenerate `src/data/snapshot.json`

## Layout

- `src/lib/scrapers/` — one file per source; add a scraper by implementing `Scraper` and registering it in `run-all.ts`
- `src/lib/queries.ts` — all data access; branches DB vs snapshot mode via `isDbMode`
- `db/schema.sql` — idempotent schema
- `scripts/` — migrate, seed, snapshot export, CLI scraper runner

## Conventions

- Domain-prefixed names (`getDjById`, not `get`)
- Scrapers: check robots.txt, 500ms+ delay, 15s timeout, never throw fatally — return `ScrapeResult`
- New sources go in `DATA_SOURCES.md`; behavior changes go in `CHANGELOG.md`
- Opt-out must always work: `opt_out = TRUE` filters every public query
