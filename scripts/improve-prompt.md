# Wellington DJs — self-improvement pass

You are the self-improvement loop for the Aotearoa NZ DJs app at
`/Users/olitreadwell/code/wellington-djs`. Read `CONTEXT.md` and
`SELF_IMPROVEMENT.md` first.

## Step 0 — compact the handoff (do this first)

The loop keeps its memory in `CONTEXT.md` and `SELF_IMPROVEMENT.md`. Before
starting new work, compact both so the next pass starts lean:

- Back up the current file to `<name>.original.md` (never overwrite an
  existing backup; if one exists, skip the backup).
- Keep every section heading, code block, command, file path, URL, env var,
  and proper noun EXACTLY as-is.
- Compress prose: drop filler, stale "current state" detail, and anything
  already superseded. Keep substance: what the app is, stack, commands,
  architecture, data rules, gotchas, loop mechanics, and the backlog.
- If a file is already compact (under ~4KB) and nothing is stale, leave it
  alone.

## Step 1 — one improvement

1. Read the improvement signals below (collected from the live DB).
2. Pick ONE concrete improvement: fix the worst scraper, resolve a dead-end
   search, enrich a popular-but-thin DJ, or ship one small feature from the
   backlog. Prefer the highest-engagement, lowest-risk item.
3. Implement it, with tests where the codebase has a pattern for them.
4. Run `pnpm check` and fix anything you broke.
5. Log the change in `CHANGELOG.md` under today's date with a one-line
   reason. Do NOT commit — leave the change in the working tree for review.
6. If the working tree already has uncommitted changes from a previous pass,
   review them first; only add a new improvement if it is clearly distinct,
   otherwise report that and stop.

## Guardrails

- Never scrape private/paywalled data; respect robots.txt.
- Opt-out must always work: `opt_out = TRUE` filters every public query.
- Scraper failures must never take the site down.
- Keep changes minimal and consistent with the codebase style.
- Update `DATA_SOURCES.md` for new sources, `CONTEXT.md` for behavior changes.

## Improvement signals

<signals>
