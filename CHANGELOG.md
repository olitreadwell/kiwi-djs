# Changelog

## 2026-08-29 — Festival lineup sources + multi-event verification

- New scrapers: Northern Bass (`northern-bass`), The Others Way (`the-others-way`), Snow Machine (`snow-machine`), Newtown Festival (`newtown-festival`), Earth Beat (`earthbeat`), Tora Bombora (`tora-bombora`, no lineup announced yet), JamBase Cubadupa (`jambase`, bot-gated)
- Resident Advisor events via GraphQL (`resident-advisor`) — event pages are captcha-gated but `ra.co/graphql` is open; event IDs live in `src/lib/scrapers/residentadvisor.ts` (first: Carlucci Carnival, ra.co/events/2468041)
- Festival lineups only add DJ acts — bands, choirs, dance troupes, circus and singer-songwriter acts are filtered out (name/description/genre-tag classifier); non-DJ acts get no candidate row and no event
- DJs playing at 2+ events earn the new `multi-gigs` verification evidence; a candidate is listed only with ≥2 verifying pieces of info (`verification_level >= 2`)
- Festival lineup links (`type='festival'`) no longer count as verification evidence — a single festival appearance is not enough to list someone
- Earth Beat genre tags (per-contributor pages) drive DJ/band classification; curl fallback for its TLS-fingerprint bot block
- Verification now applies to every DJ (seed, manual, discovered, festival, RA) — no one is listed without ≥2 verifying pieces of info

## 2026-08-29 — Candidate enrichment pipeline

- Enrichment now covers discovery candidates, not just active DJs: active DJs first, then highest-evidence candidates (by `verification_level`, then `data_completeness`), so candidates can accumulate mixes/links/articles
- Second `verify-discovered` pass after enrichment promotes same-cycle candidates instead of waiting a full cycle
- Junk-marker candidates excluded from the enrichment pool

## 2026-08-29 — Self-improving loop

- `pnpm loop` — self-improving scrape loop: compact dataset → scrape → verify → snapshot → commit → push
- Data-thinness backoff: 5/10/15/30/60 min between cycles; 60-min cap guarantees ≥1 run/day
- Adaptive source management: a source erroring 3 cycles in a row is disabled for 24h, then retried (`logs/source-state.json`)
- Compaction before every cycle: junk candidates >30 days old and stale scrape rows pruned, `VACUUM ANALYZE`
- Failing-source report each cycle (worst offenders from last 24h)
- Single-instance lock (`logs/loop.pid`) so launchd + manual runs never overlap
- launchd agent `com.olitreadwell.aotearoa-djs-loop` fires daily 4:30am NZT (16:30 UTC = DeepSeek off-peak start) and self-sustains

## 2026-08-29 — Loop 2: resilience + dataset product

- Mixcloud rate-limit resilience: per-DJ backoff (`mixcloud_backoff_until`), `Retry-After` honored, resume queue, per-DJ run report lines
- SoundCloud enrichment: one-shot preflight — missing/dead `SOUNDCLOUD_CLIENT_ID` skips cleanly instead of 15 errors
- Discovery dedupe: normalized names (accents/punctuation stripped), alias-aware, venue-name blocklist; junk candidates tagged `discovery_note='junk'` and never promoted
- Dataset versioning: content-hash `version`, `ETag` + `304`, `Cache-Control` on `/dataset` + `/dataset.csv`, new `/api/v1/dataset/meta`
- Snapshot now exports only public rows (`active = TRUE`); snapshot-mode queries filter inactive candidates
- CI: `.github/workflows/ci.yml` — `pnpm check` + contract test on every push/PR
- 6 GitHub issues written with specs (rate limits, SoundCloud key, dedupe, dataset versioning, contract+CI, prod DB wiring)

## 2026-08-29 — Dossier + dataset API

- DJ dossier: generated summary, Mixcloud mixes, Bing News articles, played-with, labels/promoters, past gigs, similar DJs
- Discovery scanner: co-billed artists from gig listings + Mixcloud users → hidden candidates, promoted only when verified (mixes/links/articles)
- Junk detection: `discovery_note='junk'` candidates never promoted
- Public API v1: `/api/v1/djs`, `/djs/{id}`, `/events`, `/venues`, `/search`, `/dataset`, `/dataset.csv`
- OpenAPI 3.1 spec (`/api/openapi.json`) + Swagger UI (`/docs`) + contract test (`pnpm contract`)
- Dataset export for reuse: JSON + CSV
- Broderbeats seeded + enriched (5 articles, e.g. "Broderbeats Presents Intuition Vol. 2")

## 2026-08-29 — UTR expansion

- Undertheradar scraper now paginates the Wellington region listing (was 4 events, now 8)
- Added venue crawl: gig pages → venue pages → more gigs (8 new events, e.g. MOON)
- Venue names now captured from venue pages

## 2026-08-29 — Launch

- Scaffolded Next.js 16 + Tailwind v4 + Postgres app
- Schema: `djs`, `venues`, `events`, `scrapes`, `search_events`, `profile_views`, `changelog`
- Seeded 7 curated Wellington DJs + 10 venues (public knowledge, marked `source=seed`)
- Built 11 scrapers; 3 live (Undertheradar, San Fran, Rogue & Vagabond), 6 best-effort, 2 key-gated
- UI: home, DJ list + search + genre filter, DJ profile, event calendar, discover, opt-out
- Analytics: search logging + profile views → popularity
- Snapshot fallback mode so the site runs without a DB
- Vercel Cron daily refresh at 2am NZT
