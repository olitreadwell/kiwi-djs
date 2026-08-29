# Changelog

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
