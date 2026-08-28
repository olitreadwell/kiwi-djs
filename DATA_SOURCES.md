# Data sources

All sources are public. Scrapers live in `src/lib/scrapers/`, run daily via Vercel Cron, and record every run in the `scrapes` table (status, items found, items new, error).

## Working now

| Source | What we get | Status |
| --- | --- | --- |
| Undertheradar (Wellington region) | upcoming gigs + names | ✅ live |
| San Fran (sanfran.co.nz) | upcoming events + dates | ✅ live |
| Rogue & Vagabond (rogueandvagabond.co.nz) | upcoming gigs (UTR-powered) | ✅ live |

## Best-effort (fetched, no structured extraction yet)

| Source | What we want | Status |
| --- | --- | --- |
| Ivy Bar (ivybar.co.nz) | events | ⚠️ Wix/JS-rendered — fetch works, extraction TODO |
| The Third Eye (thethirdeye.co.nz) | events | ⚠️ JS-rendered — fetch works, extraction TODO |
| Caroline (caroline.co.nz) | events | ⚠️ JS redirect — needs headless browser |
| 100% Wellington (100percent.co.nz) | DJ names/shows | ⚠️ 403 bot-gate |
| BFM radio (bfm.co.nz) | DJ names/shows | ⚠️ unreachable from serverless |
| Resident Advisor (ra.co/clubs/wellington) | DJs + events | ⚠️ 403 bot-gate |

## Key-gated (enable via env)

| Source | Env var | Notes |
| --- | --- | --- |
| SoundCloud search | `SOUNDCLOUD_CLIENT_ID` | Public web client id. Search "wellington dj/techno/dnb" → new DJ profiles with SoundCloud links. Default public id is revoked; set a fresh one. |
| Eventfinda API | `EVENTFINDA_API_KEY` | Free key at api.eventfinda.co.nz. Region=wellington events feed. |

## Planned

- Venue Instagram/Facebook public event embeds (headless browser, rate-limited)
- Mixcloud API for mix links per DJ
- Spotify artist search for genre + image enrichment
- Eventfinda HTML fallback (no key) via sitemap

## Rules

- Respect `robots.txt` (enforced in `src/lib/scrapers/http.ts`)
- 500ms+ delay between requests per source
- 15s request timeout; failures recorded, never fatal
- No paywalled, logged-in, or private data. Ever.
