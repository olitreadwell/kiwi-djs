import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { normaliseGenres } from '../genres';
import { isNzLocation } from '../locations';
import type { ScrapeResult } from './types';

interface DjRow {
  id: string;
  name: string;
}

// Pull bio, genre tags and location off a DJ's Bandcamp page. The artist
// page often redirects to a track page, which carries the same bio and the
// artist's `<a class="tag">` tags — the last one is usually a location.
export async function enrichBandcamp(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const link = await pool.query(`SELECT url FROM dj_links WHERE dj_id = $1 AND type = 'bandcamp' LIMIT 1`, [dj.id]);
  const url = link.rows[0]?.url as string | undefined;
  if (!url) return { status: 'partial', items_found: 0, items_new: 0, error: 'No Bandcamp link' };

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    return { status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  let found = 0;

  const bioMatch = html.match(/id="bio-text"[^>]*>([\s\S]*?)<\/div>/);
  const bio = bioMatch ? decodeHtml(bioMatch[1]).replace(/\s+/g, ' ').trim() : '';
  if (bio) {
    const row = await pool.query('SELECT bio FROM djs WHERE id = $1', [dj.id]);
    if (!row.rows[0]?.bio) {
      await pool.query('UPDATE djs SET bio = $2 WHERE id = $1', [dj.id, bio.slice(0, 2000)]);
      found += 1;
    }
  }

  const tags = [...html.matchAll(/<a[^>]*class="[^"]*\btag\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter((tag) => tag.length > 1 && tag.length <= 40);
  const locationTag = tags.find((tag) => isNzLocation(tag) || /\bnew zealand\b|aotearoa|\bnz\b/i.test(tag));
  if (locationTag) {
    await pool.query(`UPDATE djs SET profile_location = COALESCE(profile_location, $2) WHERE id = $1`, [dj.id, `Bandcamp: ${locationTag}`]);
    await pool.query(
      `UPDATE djs SET verification_sources = (SELECT array_agg(DISTINCT g) FROM unnest(verification_sources || ARRAY['location']) AS g) WHERE id = $1`,
      [dj.id],
    );
    found += 1;
  }

  // Genre tags: skip location-looking tags, normalise the rest.
  const genreTags = tags.filter((tag) => !isNzLocation(tag) && !/\bnew zealand\b|aotearoa|\bnz\b/i.test(tag) && !/^www\./i.test(tag));
  if (genreTags.length > 0) {
    const normalised = normaliseGenres(genreTags);
    if (normalised.length > 0) {
      await pool.query(
        `UPDATE djs SET genres = (SELECT array_agg(g) FROM (SELECT DISTINCT g FROM unnest(genres || $2::text[]) AS g LIMIT 8) t) WHERE id = $1`,
        [dj.id, normalised],
      );
      found += normalised.length;
    }
  }

  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: 0,
    error: found === 0 ? 'No bio/tags/location extracted' : undefined,
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeHtml(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code] ?? entity;
  });
}
