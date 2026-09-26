// Human labels for dj_links types, shared by the profile and the smart link
// page so one spelling is used everywhere (#74).
export const TYPE_LABELS: Record<string, string> = {
  soundcloud: "SoundCloud",
  mixcloud: "Mixcloud",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  spotify: "Spotify",
  bandcamp: "Bandcamp",
  "apple-music": "Apple Music",
  tidal: "Tidal",
  deezer: "Deezer",
  qobuz: "Qobuz",
  snapchat: "Snapchat",
  twitch: "Twitch",
  beatport: "Beatport",
  "resident-advisor": "Resident Advisor",
  twitter: "Twitter / X",
  youtube: "YouTube",
  discogs: "Discogs",
  tiktok: "TikTok",
  mastodon: "Mastodon",
  threads: "Threads",
  radio: "Radio",
  festival: "Festival",
  news: "News",
  "other databases": "Other databases",
  "free streaming": "Free streaming",
  "purchase for download": "Download",
  streaming: "Streaming",
  "social network": "Social",
  wikidata: "Wikidata",
  allmusic: "AllMusic",
  myspace: "MySpace",
};

export function linkLabel(type: string, label: string | null): string {
  return label ?? TYPE_LABELS[type] ?? type;
}

// Pills show the platform name only — never the URL or a raw label (#74).
export function pillLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// List rows show a clean label: strip any URL and "type:" prefixes that
// older enrichment runs stored in the label column.
export function displayLabel(type: string, label: string | null): string {
  const cleaned = (label ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[a-z-]+:\s*/i, "")
    .replace(/[:\s]+$/g, "")
    .trim();
  return cleaned || TYPE_LABELS[type] || type;
}

export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Pills on an event lineup are capped, so the order decides what a visitor
// sees: the artist's own channels first (SoundCloud, Mixcloud, Bandcamp,
// socials), then the streaming catalogs, then directory entries.
export const EVENT_LINK_PRIORITY: string[] = [
  "soundcloud",
  "mixcloud",
  "bandcamp",
  "instagram",
  "facebook",
  "twitter",
  "resident-advisor",
  "spotify",
  "apple-music",
  "beatport",
  "youtube",
  "website",
  "radio",
  "festival",
];

/** Same URL written two ways (".../bandcamp.com" vs ".../bandcamp.com/"). */
function linkIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return `https://${host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Order one artist's links for a lineup card: known platforms first, and one
 * pill per destination even when two sources stored the URL differently.
 */
export function prioritiseEventLinks<T extends { type: string; url: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links
    .filter((link) => {
      const identity = linkIdentity(link.url);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((link, index) => ({ link, index }))
    .sort((a, b) => {
      const rank = (type: string): number => {
        const position = EVENT_LINK_PRIORITY.indexOf(type);
        return position === -1 ? EVENT_LINK_PRIORITY.length : position;
      };
      const byRank = rank(a.link.type) - rank(b.link.type);
      return byRank !== 0 ? byRank : a.index - b.index;
    })
    .map((entry) => entry.link);
}
