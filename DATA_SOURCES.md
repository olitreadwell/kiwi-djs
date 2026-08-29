# Data sources

All sources are public. Scrapers live in `src/lib/scrapers/`, run daily via Vercel Cron, and record every run in the `scrapes` table (status, items found, items new, error).

## Working now

| Source | What we get | Status |
| --- | --- | --- |
| Undertheradar (Wellington region) | upcoming gigs + names | ✅ live |
| Undertheradar venue RSS (Afters, MOON, San Fran, Cuba St Tavern, Pow Wow Room, Valhalla) | per-venue gigs + names | ✅ live |
| San Fran (sanfran.co.nz) | upcoming events + dates | ✅ live |
| Rogue & Vagabond (rogueandvagabond.co.nz) | upcoming gigs (UTR-powered) | ✅ live |
| Mixcloud API | per-DJ mixes + user links | ✅ live |
| Bing News RSS | per-DJ news articles | ✅ live |
| Event-name discovery | new DJ candidates from co-billed gigs | ✅ live (candidates hidden until verified) |
| Northern Bass (northernbass.co.nz/lineup) | festival lineup → DJ candidates + events | ✅ live (electronic-only festival, all acts kept) |
| The Others Way (theothersway.co.nz/lineup) | festival lineup → DJ candidates + events | ✅ live (DJ acts only) |
| Snow Machine NZ (nz.snow-machine.com/artists/) | festival lineup → DJ candidates + events | ✅ live (electronic festival, non-DJ headliners excluded) |
| Newtown Festival (newtownfestival.org.nz/artists/) | festival lineup → DJ candidates + events | ✅ live (DJ acts only, from performer blurbs) |
| Earth Beat (earthbeatfestival.com/music-lineup) | festival lineup → DJ candidates + events | ✅ live (genre-tag classified; curl fallback for TLS block) |
| Tora Bombora (torabombora.co.nz/lineup) | festival lineup | ⚠️ no lineup announced yet |
| JamBase Cubadupa (jambase.com/festival/cubadupa-2026) | festival lineup | ⚠️ bot-gated (BigScoots captcha) |
| Resident Advisor events (ra.co/events/{id}) | event lineup → DJ candidates + events | ✅ live via GraphQL API (event pages are captcha-gated; add event IDs in `src/lib/scrapers/residentadvisor.ts`) |

## Best-effort (fetched, no structured extraction yet)

| Source | What we want | Status |
| --- | --- | --- |
| Ivy Bar (ivybar.co.nz) | events | ⚠️ Wix/JS-rendered — fetch works, extraction TODO |
| The Third Eye (thethirdeye.co.nz) | events | ⚠️ JS-rendered — fetch works, extraction TODO |
| Caroline (caroline.co.nz) | events | ⚠️ JS redirect — needs headless browser |
| 100% Wellington (100percent.co.nz) | DJ names/shows | ⚠️ 403 bot-gate |
| BFM radio (bfm.co.nz) | DJ names/shows | ⚠️ unreachable from serverless |
| Resident Advisor (ra.co/clubs/wellington) | DJs + events | ⚠️ club pages 403 bot-gate; specific events work via GraphQL |

## Key-gated (enable via env)

| Source | Env var | Notes |
| --- | --- | --- |
| SoundCloud search | `SOUNDCLOUD_CLIENT_ID` | Public web client id. Search "wellington dj/techno/dnb" → new DJ profiles with SoundCloud links. Default public id is revoked; set a fresh one. |
| Eventfinda API | `EVENTFINDA_API_KEY` | Free key at api.eventfinda.co.nz. Region=wellington events feed. |
| Eventfinda sitemap fallback | none | Sitemap event URLs + hCalendar parse, no key needed |

## Keyless APIs

| Source | What we get | Status |
| --- | --- | --- |
| MusicBrainz API | artist aliases, links (Bandcamp/RA/socials), genres | ✅ live (server can 503 under load) |
| iTunes Search API | artist image, primary genre | ✅ live |
| Nominatim (OSM) | venue address → NZ region | ✅ live |

## Planned

- Venue Instagram/Facebook public event embeds (headless browser, rate-limited)
- Spotify artist search for genre + image enrichment
- Eventfinda HTML fallback (no key) via sitemap
- SoundCloud enrichment (needs fresh `SOUNDCLOUD_CLIENT_ID`)

## Rules

- Respect `robots.txt` (enforced in `src/lib/scrapers/http.ts`)
- 500ms+ delay between requests per source
- 15s request timeout; failures recorded, never fatal
- No paywalled, logged-in, or private data. Ever.
- Festival lineups add only DJ acts; a DJ is listed publicly only with ≥2 verifying pieces of info (e.g. playing 2+ events)
