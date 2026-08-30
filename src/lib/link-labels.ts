// Human labels for dj_links types, shared by the profile and the smart link
// page so one spelling is used everywhere (#74).
export const TYPE_LABELS: Record<string, string> = {
  soundcloud: 'SoundCloud',
  mixcloud: 'Mixcloud',
  instagram: 'Instagram',
  facebook: 'Facebook',
  website: 'Website',
  spotify: 'Spotify',
  bandcamp: 'Bandcamp',
  'apple-music': 'Apple Music',
  tidal: 'Tidal',
  deezer: 'Deezer',
  qobuz: 'Qobuz',
  snapchat: 'Snapchat',
  twitch: 'Twitch',
  beatport: 'Beatport',
  'resident-advisor': 'Resident Advisor',
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  discogs: 'Discogs',
  tiktok: 'TikTok',
  mastodon: 'Mastodon',
  threads: 'Threads',
  radio: 'Radio',
  festival: 'Festival',
  news: 'News',
  'other databases': 'Other databases',
  'free streaming': 'Free streaming',
  'purchase for download': 'Download',
  streaming: 'Streaming',
  'social network': 'Social',
  wikidata: 'Wikidata',
  allmusic: 'AllMusic',
  myspace: 'MySpace',
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
  const cleaned = (label ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^[a-z-]+:\s*/i, '')
    .replace(/[:\s]+$/g, '')
    .trim();
  return cleaned || TYPE_LABELS[type] || type;
}

export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
