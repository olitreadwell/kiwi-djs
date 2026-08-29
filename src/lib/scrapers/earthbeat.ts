import * as cheerio from 'cheerio';
import { execFileSync } from 'node:child_process';
import type { Pool } from 'pg';
import { checkRobots, sleep, UA } from './http';
import { ingestFestivalLineup, isDjGenreTag, type FestivalArtist } from './festival';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://www.earthbeatfestival.com/music-lineup';
const CONTRIBUTOR_URL = 'https://www.earthbeatfestival.com/contributor/mantismash';

// Earth Beat's WAF drops node's TLS handshake (ETIMEDOUT) while accepting
// curl's — TLS-fingerprint bot block. Fall back to curl for this host.
function fetchEarthbeatHtml(url: string): string {
  return execFileSync('curl', ['-sL', '--max-time', '20', '-A', UA, url], {
    encoding: 'utf8',
    timeout: 25000,
  });
}

export function parseEarthbeatLineup(html: string): FestivalArtist[] {
  const $ = cheerio.load(html);
  const artists: FestivalArtist[] = [];
  $('.article-item').each((_, el) => {
    const name = $(el).find('h3 a').first().text().replace(/\s+/g, ' ').trim();
    const description = $(el).find('.label').first().text().replace(/\s+/g, ' ').trim();
    if (name) artists.push({ name, description });
  });
  return artists;
}

export const earthbeatScraper: Scraper = {
  source: 'earthbeat',
  async run(pool: Pool): Promise<ScrapeResult> {
    if (!(await checkRobots(CONTRIBUTOR_URL))) {
      return { status: 'error', items_found: 0, items_new: 0, error: `Blocked by robots.txt: ${CONTRIBUTOR_URL}` };
    }
    // Contributor pages list the full current-year lineup with a genre tag
    // per act — the genre tag is what separates DJs from live bands.
    const html = fetchEarthbeatHtml(CONTRIBUTOR_URL);
    const artists = parseEarthbeatLineup(html).filter((artist) => isDjGenreTag(artist.name, artist.description ?? ''));
    await sleep(500);
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: 'earthbeat-2025',
      eventName: 'Earth Beat Festival 2025',
      venue: 'Kaipara, Northland',
      startsAt: null,
      url: LINEUP_URL,
      artists,
      includeAll: true,
    });
  },
};
