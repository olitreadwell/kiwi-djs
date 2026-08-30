// Official artist websites are the most authoritative source we never read:
// we store the link but don't scrape the bio, releases, or shows. This
// enrichment pass fixes that — bio first (highest value), releases
// best-effort, one site per second, robots.txt-respecting.
import type { Pool } from 'pg';
import { fetchHtml, sleep } from './http';
import { slugify } from '../slug';
import type { Scraper, ScrapeResult } from './types';

const BIO_PAGES = ['/about', '/bio', '/history', '/info'];
const RELEASE_PAGES = ['/music', '/releases', '/discography', '/albums', '/songs'];

const MUSIC_WORDS =
  /\b(dj|producer|house|techno|disco|funk|soul|bass|drum|mix|set|label|release|vinyl|edit|remix|club|festival|radio|resident|selector|boogie|garage|dub|trance|breaks|hip hop|r&b|jazz|afro|amapiano|gqom|electronic|dance)\b/i;
const NAV_WORDS =
  /\b(home|about|history|gallery|discography|jukebox|links?|past gigs?|contact|shop|news|videos?|photos?|media|press|merch|listen|watch|bookings?|management|events?|tour|bio|info)\b/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

// Longest sentence-run that mentions the artist or music — the bio.
function extractBio(text: string, artistName: string): { bio: string; score: number } | null {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const lastName = artistName.split(' ').pop()?.toLowerCase() ?? '';
  let best = '';
  let bestScore = -Infinity;
  for (let i = 0; i < sentences.length; i += 1) {
    let run = sentences[i];
    for (let j = i + 1; j < Math.min(i + 4, sentences.length); j += 1) {
      run += ` ${sentences[j]}`;
    }
    const mentionsArtist = run.toLowerCase().includes(artistName.toLowerCase());
    const mentionsLastName = lastName !== '' && run.toLowerCase().includes(lastName);
    const musicHits = (run.match(MUSIC_WORDS) ?? []).length;
    const navHits = (run.match(NAV_WORDS) ?? []).length;
    if (run.length < 120 || musicHits < 2) continue;
    // Prefer music-dense, nav-light windows; full-name mention is a bonus,
    // not a requirement (bios often say just "Booker").
    const score = musicHits * 3 - navHits * 2 - (mentionsArtist || mentionsLastName ? 0 : 4);
    if (score > bestScore) {
      bestScore = score;
      best = run;
    }
  }
  return best ? { bio: best, score: bestScore } : null;
}

function extractReleases(text: string): Array<{ title: string; year: number }> {
  const out: Array<{ title: string; year: number }> = [];
  const seen = new Set<string>();
  const patterns = [
    /([A-Z][A-Za-z0-9&'’\-!? ]{2,60}?)\s*[(\[]\s*((?:19|20)\d{2})\s*[)\]]/g,
    /([A-Z][A-Za-z0-9&'’\-!? ]{2,60}?)\s*[—–-]\s*((?:19|20)\d{2})(?!\d)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const title = match[1].trim().replace(/\s+/g, ' ');
      const year = Number(match[2]);
      if (year < 1990 || year > 2026) continue;
      if (title.length < 3 || title.length > 60) continue;
      if (/^(home|about|contact|news|music|releases|discography|albums|songs|shop|tour|bio|history|info|listen|watch|press|merch|videos?)$/i.test(title)) continue;
      const key = `${title.toLowerCase()}-${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, year });
    }
  }
  return out.slice(0, 12);
}

async function sitePages(baseUrl: string): Promise<string[]> {
  const root = baseUrl.replace(/\/$/, '');
  const pages = new Set<string>([baseUrl, ...BIO_PAGES.map((path) => `${root}${path}`), ...RELEASE_PAGES.map((path) => `${root}${path}`)]);
  try {
    const sitemap = await fetchHtml(`${root}/sitemap.xml`);
    let sitemapUrls = 0;
    for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = match[1].trim();
      if (url.startsWith(baseUrl) && sitemapUrls < 8) {
        pages.add(url);
        sitemapUrls += 1;
      }
    }
  } catch {
    // no sitemap — fall back to common paths
  }
  return [...pages].slice(0, 20);
}

export async function enrichOfficialSites(pool: Pool, limit = 15): Promise<ScrapeResult> {
  const targets = (
    await pool.query(
      `SELECT d.id, d.name, d.bio, COALESCE(d.website_url, l.url) AS site
       FROM djs d
       LEFT JOIN dj_links l ON l.dj_id = d.id AND l.type = 'website'
       WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE
         AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')
         AND COALESCE(d.website_url, l.url) IS NOT NULL
         AND (d.bio IS NULL OR length(d.bio) < 200)
       ORDER BY d.popularity DESC
       LIMIT $1`,
      [limit],
    )
  ).rows as Array<{ id: string; name: string; bio: string | null; site: string }>;
  let enriched = 0;
  let releasesFound = 0;
  for (const target of targets) {
    let bestBio: { bio: string; score: number } | null = null;
    const releases: Array<{ title: string; year: number }> = [];
    try {
      const pages = await sitePages(target.site);
      for (const page of pages) {
        const html = await fetchHtml(page);
        const text = stripHtml(html);
        const candidate = extractBio(text, target.name);
        if (candidate && (!bestBio || candidate.score > bestBio.score)) bestBio = candidate;
        if (/music|release|discograph|album|song/i.test(page)) {
          releases.push(...extractReleases(text));
        }
        await sleep(1000);
      }
    } catch {
      // site unreachable or robots-blocked — skip, never fatal
    }
    if (bestBio && (!target.bio || bestBio.bio.length > target.bio.length)) {
      await pool.query(`UPDATE djs SET bio = $2, updated_at = now() WHERE id = $1`, [target.id, bestBio.bio]);
      enriched += 1;
    }
    for (const release of releases) {
      const id = `${target.id}-${slugify(release.title)}-${release.year}`;
      const result = await pool.query(
        `INSERT INTO dj_releases (id, dj_id, title, year, url) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, target.id, release.title, release.year, target.site],
      );
      if (result.rows.length > 0) releasesFound += 1;
    }
  }
  return {
    status: enriched > 0 || releasesFound > 0 ? 'ok' : 'partial',
    items_found: enriched + releasesFound,
    items_new: enriched + releasesFound,
    error: enriched === 0 && releasesFound === 0 ? 'No official-site bios or releases found' : undefined,
  };
}

export const officialSiteScraper: Scraper = { source: 'official-site', run: enrichOfficialSites };
