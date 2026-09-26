import type { Pool } from "pg";
import { slugify } from "../slug";
import { upsertDjLink } from "./enrich";
import { checkRobots, sleep, UA } from "./http";
import { ingestFestivalLineup } from "./festival";
import type { Scraper, ScrapeResult } from "./types";

const GRAPHQL_URL = "https://ra.co/graphql";

// Resident Advisor event pages are DataDome-captcha-gated, but the GraphQL
// API behind the site is open. Add event IDs here as they're requested.
const EVENT_IDS = ["2468041"]; // Carlucci Carnival @ Carlucci Land, 2026-09-26

// RA holds each listed artist's own socials, so the lineup can link straight
// out to a SoundCloud or Instagram without fuzzy name matching (#340).
const RA_ARTIST_LINK_FIELDS = [
  ["soundcloud", "soundcloud"],
  ["instagram", "instagram"],
  ["facebook", "facebook"],
  ["twitter", "twitter"],
  ["bandcamp", "bandcamp"],
  ["discogs", "discogs"],
  ["website", "website"],
] as const;

// Denormalised columns on djs that mirror the same links, so search and the
// profile header see the RA-supplied profile too.
const RA_ARTIST_COLUMNS: Record<string, string> = {
  soundcloud: "soundcloud_url",
  instagram: "instagram_url",
  facebook: "facebook_url",
  website: "website_url",
};

// Per-event artist cap. Every artist costs one GraphQL call, so a big festival
// lineup stays inside the run budget.
const ARTIST_LINK_LIMIT = Number(process.env.RA_ARTIST_LINK_LIMIT ?? 25);

interface RaArtist {
  id: string;
  name: string;
}

export interface RaArtistDetail extends RaArtist {
  urlSafeName?: string | null;
  contentUrl?: string | null;
  soundcloud?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  bandcamp?: string | null;
  discogs?: string | null;
  website?: string | null;
}

interface RaEvent {
  id: string;
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  venue?: { id: string; name: string };
  artists?: RaArtist[];
}

async function fetchRaEvent(eventId: string): Promise<RaEvent> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ra.co",
      referer: `https://ra.co/events/${eventId}`,
      "user-agent": UA,
    },
    body: JSON.stringify({
      query:
        "query Event($id: ID!) { event(id: $id) { id title date startTime endTime venue { id name } artists { id name } } }",
      variables: { id: eventId },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RA GraphQL HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { event?: RaEvent | null } };
  const event = data.data?.event;
  if (!event) throw new Error(`RA event ${eventId} not found`);
  return event;
}

async function fetchRaArtist(artistId: string): Promise<RaArtistDetail | null> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ra.co",
      referer: `https://ra.co/dj/${artistId}`,
      "user-agent": UA,
    },
    body: JSON.stringify({
      query:
        "query Artist($id: ID!) { artist(id: $id) { id name urlSafeName contentUrl soundcloud instagram facebook twitter bandcamp discogs website } }",
      variables: { id: artistId },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { artist?: RaArtistDetail | null } };
  return data.data?.artist ?? null;
}

/** RA profile URL for an artist, taken from the API's own relative contentUrl. */
export function raArtistProfileUrl(artist: RaArtistDetail): string | null {
  if (artist.contentUrl?.startsWith("/")) return `https://ra.co${artist.contentUrl}`;
  if (artist.urlSafeName) return `https://ra.co/dj/${artist.urlSafeName}`;
  return null;
}

/**
 * One spelling per profile URL. RA stores hosts both with and without a
 * `www.` prefix, mixes http and https, and sometimes carries the signed-out
 * Instagram stub, which is a placeholder rather than an artist profile.
 */
export function normaliseRaArtistUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  if (host === "instagram.com" && !path) return null;
  return path ? `https://${host}${path}${url.search}` : `https://${host}`;
}

/** Every outbound link RA holds for one artist, deduped by URL. */
export function raArtistLinks(artist: RaArtistDetail): Array<{ type: string; url: string }> {
  const links = new Map<string, { type: string; url: string }>();
  for (const [field, type] of RA_ARTIST_LINK_FIELDS) {
    const raw = artist[field];
    const url = raw ? normaliseRaArtistUrl(raw) : null;
    if (url) links.set(url, { type, url });
  }
  const profileUrl = raArtistProfileUrl(artist);
  const profile = profileUrl ? normaliseRaArtistUrl(profileUrl) : null;
  if (profile) links.set(profile, { type: "resident-advisor", url: profile });
  return [...links.values()];
}

/** RA billing drops the country qualifier ("Caru (NZ)" -> "Caru"). */
export function cleanRaArtistName(name: string): string {
  return name.replace(/\s*\((?:NZ|CA|UK|US|AU|DE|FR|NL|BE|ES|IT|JP)\)\s*$/i, "").trim();
}

/**
 * Copy each RA artist's own socials onto the matching DJ row. Only artists the
 * lineup ingest already created are touched, so nothing is linked by guesswork.
 */
async function linkRaArtistSocials(pool: Pool, artists: RaArtist[]): Promise<number> {
  let linked = 0;
  for (const artist of artists.slice(0, ARTIST_LINK_LIMIT)) {
    const djId = slugify(cleanRaArtistName(artist.name));
    if (!djId) continue;
    const known = await pool.query(`SELECT 1 FROM djs WHERE id = $1`, [djId]);
    if (known.rows.length === 0) continue;
    const detail = await fetchRaArtist(artist.id);
    await sleep(600);
    if (!detail) continue;
    for (const link of raArtistLinks(detail)) {
      await upsertDjLink(pool, djId, link.type, link.url);
      linked += 1;
      const column = RA_ARTIST_COLUMNS[link.type];
      if (column) {
        await pool.query(`UPDATE djs SET ${column} = COALESCE(${column}, $2) WHERE id = $1`, [
          djId,
          link.url,
        ]);
      }
    }
  }
  return linked;
}

export const residentAdvisorScraper: Scraper = {
  source: "resident-advisor",
  async run(pool: Pool): Promise<ScrapeResult> {
    if (!(await checkRobots(`https://ra.co/events/${EVENT_IDS[0]}`))) {
      return { status: "error", items_found: 0, items_new: 0, error: "Blocked by robots.txt" };
    }
    let found = 0;
    let newCount = 0;
    for (const eventId of EVENT_IDS) {
      const event = await fetchRaEvent(eventId);
      const artists = (event.artists ?? [])
        .map((artist) => cleanRaArtistName(artist.name))
        .filter(Boolean);
      const result = await ingestFestivalLineup(pool, this.source, {
        eventIdPrefix: `ra-${eventId}`,
        eventName: event.title,
        venue: event.venue?.name,
        startsAt: event.startTime ? new Date(event.startTime) : null,
        url: `https://ra.co/events/${eventId}`,
        artists,
        includeAll: true,
        djSource: "resident-advisor",
      });
      found += result.items_found;
      newCount += result.items_new;
      const linked = await linkRaArtistSocials(pool, event.artists ?? []);
      found += linked;
      console.log(`  ${this.source}: ${linked} artist links from RA`);
    }
    return {
      status: found > 0 ? "ok" : "partial",
      items_found: found,
      items_new: newCount,
      error: found === 0 ? "No artists parsed" : undefined,
    };
  },
};
