# Self-improvement loop

The app improves itself on a weekly cadence using real usage data.

## Signals we collect

- `search_events` — every search query + result count
- `profile_views` — every profile open (drives `popularity`)
- `scrapes` — every scraper run: status, items found/new, error
- `data_completeness` — per-DJ score (0-100) from filled fields

## Loop

1. **Enrich the searched** — if a DJ is searched often but has low `data_completeness`, they get priority in the next scraper pass (SoundCloud/Eventfinda enrichment, manual verification queue).
2. **Fix broken scrapers weekly** — `scrapes` table shows which sources fail. Each week: fix the worst offender, add a test, log it in `CHANGELOG.md`.
3. **One feature per week** — pick from engagement data (most-searched genres, most-viewed profiles, dead-end searches). Ideas backlog below.
4. **Changelog everything** — every change lands in `CHANGELOG.md` with date + reason.

## Weekly checklist

- [ ] `SELECT source, status, count(*) FROM scrapes GROUP BY 1,2 ORDER BY 3 DESC;` — fix worst source
- [ ] `SELECT query, count(*) FROM search_events GROUP BY 1 ORDER BY 2 DESC LIMIT 20;` — spot dead ends
- [ ] `SELECT id, name, popularity, data_completeness FROM djs ORDER BY popularity DESC LIMIT 20;` — pick enrichment targets
- [ ] Ship one feature, log it

## Feature backlog (pick by engagement)

- Mixes tab per DJ (Mixcloud/SoundCloud tracks)
- Venue pages with upcoming lineups
- "Similar DJs" by genre overlap
- Email/IG alerts for a DJ's next gig
- Genre explorer with counts
- Opt-out verification flow (email confirm)
- Weekly "who's playing" digest

## Guardrails

- Never scrape private/paywalled data
- Opt-out is instant and permanent until the DJ asks to return
- Scraper failures must never take the site down (they're isolated + logged)
