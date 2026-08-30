# AGENTS.md

> **Read `CONTEXT.md` first** — it is the live project handoff: current state, active goal, in-progress work, gotchas.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm db:setup` — migrate + seed local DB
- `pnpm scrape` — run all scrapers once
- `pnpm db:snapshot` — regenerate `src/data/snapshot.json`

## Layout

- `src/lib/scrapers/` — one file per source; add a scraper by implementing `Scraper` and registering it in `run-all.ts`
- `src/lib/queries.ts` — data-access facade; picks `PostgresRepo` or `SnapshotRepo` via `isDbMode`
- `src/lib/repo/` — `types.ts` (row types + `DataRepository` interface), `postgres.ts`, `snapshot.ts` adapters
- `src/lib/schemas.ts` — Zod schemas for the public API (responses → OpenAPI components, query params → route validation)
- `db/schema.sql` — idempotent schema
- `scripts/` — migrate, seed, snapshot export, CLI scraper runner

## Conventions

- Domain-prefixed names (`getDjById`, not `get`)
- Scrapers: check robots.txt, 500ms+ delay, 15s timeout, never throw fatally — return `ScrapeResult`
- New sources go in `DATA_SOURCES.md`; behavior changes go in `CHANGELOG.md`
- Opt-out must always work: `opt_out = TRUE` filters every public query

## Feedback → issues workflow

Every piece of user feedback becomes a GitHub issue, not just a one-off fix:

1. Do a quick scan for the generic version of the problem — e.g. "one artist's
   SoundCloud says Melbourne" becomes "DJs whose profiles list a non-NZ
   location aren't flagged".
2. Write the issue as a spec: what a user probably wants to see, acceptance
   criteria, where to look in the code.
3. Label it with a priority (`P0`–`P3`) and a persona
   (`persona: attendee|promoter|dj|researcher|nz-fan`).
4. Fixing it now is fine; otherwise it stays queued and the loop picks it up
   later. Always cross-link the fix to the issue when it ships.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
