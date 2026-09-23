# Handoff: Carlucci Carnival timetable + dead SoundCloud links — 2026-09-24

## Task

Two threads of work, both uncommitted.

1. Enter the four Carlucci Carnival stage timetables (Carlucci Land, 2026-09-26: Steel
   Circus, Dragon's Gate, Forest Grove, The Laboratory) from four poster screenshots the
   user supplied, so the set times are visible on the festival/event pages.
2. Fix dead SoundCloud links the user kept hitting ("not found") in kiwi-djs.

Done means: timetable data in the dataset of whichever repo is current, rendered on the
page, checks green; dead SoundCloud mixes hidden from public reads with a repeatable sweep
behind them.

## State

- `kiwi-djs` (cwd, `/Users/oli/code/kiwi-djs`): feature work complete and verified,
  **uncommitted**. Live local Postgres on `localhost` (db `kiwi_djs`, `DATABASE_URL` in
  `.env.local`), self-improving loop running (pid 26594, ~9.5h uptime, phase `scrape`,
  committing `src/data/snapshot.json` every cycle). The loop already ran the new
  `carlucci-carnival` scraper: 33 slot rows across 4 stages in the DB. Loop snapshot at
  last check: 21 DJs, 117 mixes, 694 live links.
- `kiwi-fests` (`/Users/oli/code/kiwi-fests`): set-times feature complete and verified,
  **uncommitted**, mixed in the tree with the user's own parallel work (see Decisions).
- Not committed anywhere. Nothing reverted.

## Decisions

- The timetable lives in **both** repos because both hold the event: kiwi-fests as a
  festival edition, kiwi-djs as `events.id = ra-2468041`. Which one the user meant was
  ambiguous; evidence (their dev server on 3123, uncommitted Carlucci lineup added that
  evening) pointed at kiwi-fests. Ask before committing, or commit both.
- kiwi-fests models **one lineup entry per billed act** (24 entries, matching the 24 poster
  slots); kiwi-djs **splits b2b bills** into individual DJ candidates that share the stage,
  set times and `act_label` (the billed text).
- kiwi-djs slot fields live on `event_djs` (`stage`, `starts_at`, `ends_at`, `act_label`,
  `source`) rather than a new table, so existing lineup joins keep working.
- Link health vocabulary: `live` | `dead` (404/410) | `blocked` (401/403, private or
  bot-hostile) | `unknown`. Only `dead` is hidden from reads; rows are marked, never
  deleted, so the 30-day retry can revive them.
- SoundCloud pages answer 503 to server fetches, so `oembed` is the only reliable probe:
  200 exists, 404 deleted, 403 restricted.
- Times stored as ISO 8601 with the venue offset (`2026-09-26T16:00:00+12:00`); 26 Sep 2026
  is still NZST, DST starts the next day.

## Files touched

kiwi-djs (all uncommitted):

- `src/lib/scrapers/carlucci-carnival.ts` (new) — curated timetable, `splitB2b`, registered
  in `src/lib/scrapers/run-all.ts`
- `src/lib/scrapers/festival.ts` — `stage`/`startsAt`/`endsAt`/`actLabel`, `splitBilledAct`,
  `upsertEventSlot`
- `src/lib/link-health.ts` (new) — `checkSoundCloudUrl`, `checkLinkHealth`, `sweepLinkHealth`
- `db/schema.sql` — slot columns on `event_djs`; `status` + `last_checked_at` on `dj_mixes`
  and `dj_links`
- `src/lib/repo/{types,postgres,snapshot}.ts` — `getEventSets`; dead-link filtering;
  completeness ignores dead mixes
- `src/lib/queries.ts`, `src/app/events/[id]/page.tsx` — `getEventSets`, Set times section
- `scripts/export-snapshot.mjs` — slot columns + link status in the snapshot
- `scripts/dataset-fixes.ts` — issue #130 rule (300 URLs/pass, 30-day retry)
- `src/data/snapshot.json` — no longer mine: the loop regenerates and commits it

kiwi-fests (mine, uncommitted):

- `src/data/lineups.ts` — `stage`/`setStart`/`setEnd` on `lineupEntrySchema` + 24 Carlucci
  entries; `src/data/artists.ts` — `Pearly*` to `Pearly`
- `src/lib/format.ts` (+ test) — `formatSetClock`, `formatSetRange`
- `src/lib/festival-data.ts`, `src/lib/festival-types.ts` (+ test) — set times in the view,
  running order
- `src/components/FestivalSetTimes.tsx` (+ new test), `src/app/festivals/[slug]/page.tsx`
- `src/data/items.ts` — Carlucci 3pm–10pm to 3pm–11pm, notes mention set times
- `README.md`, `CHANGELOG.md`, `src/data/lineups.test.ts` (new)

## Commands / environment

- kiwi-djs: `pnpm db:migrate`, `pnpm build`, `pnpm lint`, `pnpm typecheck`. Sweep:
  `node --env-file=.env.local --import tsx --eval` calling `DATASET_FIXES.find(f =>
  f.issueNumber === 130).fix(pool)`.
- kiwi-djs probes: `https://soundcloud.com/oembed?format=json&url=<url>` (200/404/403).
- kiwi-fests: `pnpm run build:snapshot`, `npx prettier --write`, `pnpm run lint`,
  `pnpm run typecheck`, `pnpm run test:coverage`, `pnpm run build`. Dev check on
  `npx next dev -p 3131` then curl `/festivals/carlucci-carnival`.
- Postgres client work needs `--env-file=.env.local`; plain `tsx -e` does not resolve the
  `@/` alias, so verify repo adapters through the app, not a bare script.

## Blockers / open questions

- Commit or revert? Both repos hold uncommitted work; kiwi-fests also holds the user's
  parallel changes (geist/leaflet/react-leaflet deps, `HomeMap`, `not-found` pages,
  `e2e/app.spec.ts`, `.codespellrc`) that must not be swept into a commit of mine.
- kiwi-djs issues #328 (set times) and #130 (dead link sweep) are open; the loop has the
  #130 fix and runs it per cycle.
- `FE` is missing from the Gos b2b FE b2b Zillah billing (the 2-character name guard in
  `ingestFestivalLineup` skips it); the `act_label` still shows the full billing.
- 'kiwi-djs DB is gone' from the previous session is obsolete: the DB is up and the loop
  alive. `[guess]` the old `wellington-djs-db` docker container was replaced by the local
  `kiwi_djs` database.
- Carlucci end time: posters say last sets end 23:00, the seed said 22:00. Changed to 11pm;
  revert if 10pm was a site curfew.
- Snapshot-mode patches I made earlier are already overwritten by the loop; treat the DB as
  the source of truth and re-derive the snapshot with `pnpm db:snapshot`.

## Next steps

1. Decide commit vs revert for kiwi-djs and kiwi-fests; commit the two features separately
   and leave the user's parallel files alone.
2. Run `pnpm run check` in kiwi-fests (e2e + link checks were not run; everything else was).
3. Watch the loop's #130 pass, then comment evidence on #328 and #130 (11 dead + 34 blocked
   in the old snapshot data; 694 live / 62 blocked / 17 unknown / 3 dead in the DB).
4. Check the Carlucci pages once more after the next loop snapshot, then close #328.
