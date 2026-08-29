import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { upsertDjLink } from './enrich';
import type { Scraper, ScrapeResult } from './types';

// RadioActive.FM (88.6FM Wellington) — community radio programme page.
// Show titles like "The Breakfast Show with Frida" embed presenter names.
// robots.txt allows all except /wp-admin/.
const PRESENTER_PATTERNS = [
  /(?:with|hosted by|presented by|featuring|feat\.?)\s+([A-Z][A-Za-z0-9 .'&+=!-<>]{1,60})/i,
  /\(([A-Z][A-Za-z0-9 .'&+=!-<>]{1,60})\)/,
];

const NON_PERSON_SHOWS = new Set([
  'death til dawn', 'global pulse', 'the housing project', 'the zero hour', 'midnight marauders',
  'top 11', 'top11', 'activity guide', 'community notices', 'friday art breakdown', 'parakuihi pals',
  'cyber security', 'volunteer hour', 'drive time', 'the drive', 'breakfast show', 'morning show',
]);

export function extractShows(html: string): Array<{ title: string; url: string }> {
  const match = html.match(/data-events="(.*?)"/);
  if (!match) return [];
  try {
    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const data = JSON.parse(decoded) as { EVENTS?: Array<Array<unknown>> };
    const shows = new Map<string, string>();
    for (const event of data.EVENTS ?? []) {
      const title = String(event[3] ?? '').trim();
      const rawUrl = String(event[6] ?? '').trim();
      if (title && !shows.has(title)) shows.set(title, rawUrl);
    }
    return [...shows.entries()].map(([title, url]) => ({ title, url }));
  } catch {
    return [];
  }
}

export function extractPresenters(shows: Array<{ title: string; url: string }>): Array<{ name: string; show: string; url: string }> {
  const found = new Map<string, string>();
  const urls = new Map<string, string>();
  for (const { title, url } of shows) {
    const rawNames: string[] = [];
    for (const pattern of PRESENTER_PATTERNS) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/[²³⁴]/g, '')
          .trim();
        if (cleaned) rawNames.push(cleaned);
        break;
      }
    }
    if (rawNames.length === 0) continue;
    for (const raw of rawNames) {
      const parts = raw.split(/\s+(?:or|&|and|with)\s+/i);
      for (const part of parts) {
        const name = part.replace(/^[:\-–—•]+|[:\-–—•]+$/g, '').replace(/\s+/g, ' ').trim();
        if (!name) continue;
        const normalized = name.toLowerCase();
        if (NON_PERSON_SHOWS.has(normalized)) continue;
        if (name.split(/\s+/).length > 4) continue;
        if (/^(the|the[’']s|all|this|our|your|my)\b/i.test(name)) continue;
        if (!found.has(name)) {
          found.set(name, title);
          urls.set(name, url);
        }
      }
    }
  }
  return [...found.entries()].map(([name, show]) => ({ name, show, url: urls.get(name) ?? '' }));
}

export const radioactiveScraper: Scraper = {
  source: 'radioactive-fm',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml('https://www.radioactive.fm/programme/');
    const presenters = extractPresenters(extractShows(html));
    if (presenters.length === 0) {
      return { status: 'partial', items_found: 0, items_new: 0, error: 'Fetched but no presenter names extracted' };
    }
    const existing = new Set((await pool.query('SELECT lower(name) AS name FROM djs')).rows.map((row) => row.name as string));
    let newCount = 0;
    for (const presenter of presenters) {
      const key = presenter.name.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      const id = presenter.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'radioactive', 20, FALSE, NULL)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, presenter.name],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
        const showUrl = presenter.url
          ? presenter.url.startsWith('http')
            ? presenter.url
            : `https://www.radioactive.fm${presenter.url}`
          : 'https://www.radioactive.fm/programme/';
        await upsertDjLink(pool, id, 'radio', showUrl, `RadioActive.FM show: ${presenter.show}`);
      }
    }
    return { status: 'ok', items_found: presenters.length, items_new: newCount };
  },
};
