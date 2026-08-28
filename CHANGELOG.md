# Changelog

## 2026-08-29 — Launch

- Scaffolded Next.js 16 + Tailwind v4 + Postgres app
- Schema: `djs`, `venues`, `events`, `scrapes`, `search_events`, `profile_views`, `changelog`
- Seeded 7 curated Wellington DJs + 10 venues (public knowledge, marked `source=seed`)
- Built 11 scrapers; 3 live (Undertheradar, San Fran, Rogue & Vagabond), 6 best-effort, 2 key-gated
- UI: home, DJ list + search + genre filter, DJ profile, event calendar, discover, opt-out
- Analytics: search logging + profile views → popularity
- Snapshot fallback mode so the site runs without a DB
- Vercel Cron daily refresh at 2am NZT
