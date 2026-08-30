// Canonical genre map (#34): fold aliases, case variants, punctuation and
// synonyms to one spelling so filtering and display stay consistent. Keys
// are lowercase aliases; values are the canonical display spelling.
const GENRE_ALIASES: Record<string, string> = {
  'drum & bass': 'Drum and Bass',
  'drum and bass': 'Drum and Bass',
  dnb: 'Drum and Bass',
  "drum'n'bass": 'Drum and Bass',
  'drum n bass': 'Drum and Bass',
  'hip-hop/rap': 'Hip-Hop',
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  'hip hop & rap': 'Hip-Hop',
  'hip-hop & rap': 'Hip-Hop',
  'hip hop and rap': 'Hip-Hop',
  'hip-hop and rap': 'Hip-Hop',
  hip: 'Hip-Hop',
  rap: 'Hip-Hop',
  'r&b': 'R&B',
  rnb: 'R&B',
  'rhythm and blues': 'R&B',
  edm: 'Electronic',
  electronic: 'Electronic',
  electro: 'Electro',
  dance: 'Dance',
  house: 'House',
  'deep house': 'Deep House',
  'deep-house': 'Deep House',
  'tech house': 'Tech House',
  'tech-house': 'Tech House',
  techno: 'Techno',
  'hard techno': 'Hard Techno',
  'minimal techno': 'Minimal Techno',
  trance: 'Trance',
  garage: 'Garage',
  'uk garage': 'UK Garage',
  dubstep: 'Dubstep',
  breaks: 'Breaks',
  breakbeat: 'Breaks',
  disco: 'Disco',
  'nu-disco': 'Nu-Disco',
  funk: 'Funk',
  boogie: 'Boogie',
  soul: 'Soul',
  jazz: 'Jazz',
  reggae: 'Reggae',
  dub: 'Dub',
  dancehall: 'Dancehall',
  'afro house': 'Afro House',
  afrobeats: 'Afrobeats',
  afrobeat: 'Afrobeats',
  'afro-beat': 'Afrobeats',
  afro: 'Afrobeats',
  latin: 'Latin',
  ambient: 'Ambient',
  downtempo: 'Downtempo',
  'trip-hop': 'Trip-Hop',
  trip: 'Trip-Hop',
  pop: 'Pop',
  'k-pop': 'K-Pop',
  'dance-pop': 'Dance-Pop',
  rock: 'Rock',
  'classic rock': 'Classic Rock',
  'psychedelic rock': 'Psychedelic Rock',
  aor: 'AOR',
  alternative: 'Alternative',
  indie: 'Indie',
  country: 'Country',
  folk: 'Folk',
  classical: 'Classical',
  metal: 'Metal',
  punk: 'Punk',
  eclectic: 'Eclectic',
  experimental: 'Experimental',
  world: 'World',
  worldwide: 'World',
  lounge: 'Lounge',
  chillout: 'Chillout',
  'liquid drum and bass': 'Liquid Drum and Bass',
  'liquid dnb': 'Liquid Drum and Bass',
  'liquid funk': 'Liquid Funk',
  neurofunk: 'Neurofunk',
  jungle: 'Jungle',
  '2-step': '2-Step',
  grime: 'Grime',
  'bass music': 'Bass Music',
  bass: 'Bass',
  'bass house': 'Bass House',
  footwork: 'Footwork',
  juke: 'Juke',
  'jersey club': 'Jersey Club',
  'baltimore club': 'Baltimore Club',
  synthwave: 'Synthwave',
  retrowave: 'Synthwave',
  minimal: 'Minimal',
  'melodic techno': 'Melodic Techno',
  'progressive house': 'Progressive House',
  'acid house': 'Acid House',
  'acid techno': 'Acid Techno',
  'detroit techno': 'Detroit Techno',
  'deep dubstep': 'Deep Dubstep',
  'uk bass': 'UK Bass',
  gqom: 'Gqom',
  amapiano: 'Amapiano',
  'baile funk': 'Baile Funk',
  cumbia: 'Cumbia',
  psytrance: 'Psytrance',
  'goa trance': 'Goa Trance',
  hardcore: 'Hardcore',
  hardstyle: 'Hardstyle',
  'happy hardcore': 'Happy Hardcore',
  gabber: 'Gabber',
  mandopop: 'Mandopop',
};

// Strip the noise SoundCloud/MusicBrainz tags carry: leading hashtags,
// trailing punctuation, accents, and stray whitespace.
function cleanGenreKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+/, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(key: string): string {
  return key
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Only keep tags that resolve to a known genre, so track tags don't pollute
// genres with artist names and track titles (#33).
const KNOWN_GENRE_KEYS = new Set(Object.keys(GENRE_ALIASES));

// Descriptors that leak in from MusicBrainz/SoundCloud tags — not genres.
const JUNK_GENRES = new Set([
  'singer', 'songwriter', 'vocalist', 'dj', 'producer', 'rapper', 'emcee', 'mc', 'band', 'artist',
]);

// Pull known multi-word genres out of compound tag soup ("TECH HOUSE JERSEY
// CLUB BALTIMORE CLUB" → Tech House + Jersey Club + Baltimore Club).
function extractKnownGenres(key: string): string[] {
  const words = key.split(' ');
  const found: string[] = [];
  for (let len = 3; len >= 2; len -= 1) {
    for (let i = 0; i + len <= words.length; i += 1) {
      const window = words.slice(i, i + len).join(' ');
      const canonical = GENRE_ALIASES[window];
      if (canonical) {
        found.push(canonical);
        i += len - 1;
      }
    }
  }
  return found;
}

export function normaliseGenre(genre: string): string {
  return normaliseGenres([genre])[0] ?? '';
}

// Split compound tags on commas/slashes ("deep house , techno" → two genres),
// then normalise each part (expanding multi-word tag soup) and dedupe.
export function normaliseGenres(genres: string[]): string[] {
  const out: string[] = [];
  for (const genre of genres) {
    for (const part of genre.split(/[,/]/)) {
      const key = cleanGenreKey(part);
      if (!key) continue;
      if (JUNK_GENRES.has(key)) continue;
      const direct = GENRE_ALIASES[key];
      if (direct) {
        out.push(direct);
        continue;
      }
      const extracted = extractKnownGenres(key);
      if (extracted.length > 0) {
        out.push(...extracted);
        continue;
      }
      out.push(titleCase(key));
    }
  }
  return [...new Set(out)];
}

// Single-word genres used to match inside compound tags ("tech house",
// "jersey club") without matching "technology" or "house music" noise.
const GENRE_WORDS = new Set([
  'house', 'techno', 'dubstep', 'garage', 'breaks', 'disco', 'funk', 'soul', 'jazz', 'reggae',
  'dub', 'dancehall', 'afro', 'latin', 'ambient', 'downtempo', 'trip', 'pop', 'rock', 'metal',
  'punk', 'folk', 'classical', 'trance', 'electro', 'bass', 'jungle', 'grime', 'minimal',
  'synthwave', 'hardcore', 'hardstyle', 'gabber', 'cumbia', 'amapiano', 'gqom', 'dnb', 'edm',
  'boogie', 'eclectic', 'experimental', 'lounge', 'chillout', 'world', 'country', 'indie',
  'alternative', 'dance', 'electronic', 'rap', 'hip', 'techno', 'house',
]);

export function isGenreTag(tag: string): boolean {
  const key = tag.trim().toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key || key.length > 40) return false;
  if (KNOWN_GENRE_KEYS.has(key)) return true;
  const words = key.split(' ');
  if (words.length === 1) return GENRE_WORDS.has(words[0]);
  // Compound tag: any 2-word window matching a known key counts.
  for (let i = 0; i < words.length - 1; i += 1) {
    if (KNOWN_GENRE_KEYS.has(`${words[i]} ${words[i + 1]}`)) return true;
  }
  return false;
}

// Generic umbrella genres don't tell users anything (#51/#53). A DJ needs a
// specific subgenre to be worth listing.
const GENERIC_GENRES = new Set([
  'Dance', 'Electronic', 'Alternative', 'Pop', 'Rock', 'Country', 'Eclectic', 'World',
  'Experimental', 'Indie', 'Metal', 'Punk', 'Folk', 'Classical', 'Lounge', 'Chillout',
]);

export function hasSpecificGenre(genres: string[]): boolean {
  return genres.some((genre) => !GENERIC_GENRES.has(genre));
}

// Accent color per primary genre for cards (#52). Tailwind classes, dark-bg
// friendly. Falls back to stone for unknown/multi-genre.
const GENRE_ACCENTS: Array<[string[], string]> = [
  [['Drum and Bass', 'Liquid Drum and Bass', 'Neurofunk', 'Jungle'], 'border-red-500/60 hover:border-red-400'],
  [['House', 'Deep House', 'Tech House', 'Progressive House', 'Acid House'], 'border-amber-500/60 hover:border-amber-400'],
  [['Techno', 'Hard Techno', 'Minimal Techno', 'Melodic Techno', 'Acid Techno', 'Detroit Techno'], 'border-sky-500/60 hover:border-sky-400'],
  [['Garage', 'UK Garage', '2-Step', 'Grime'], 'border-emerald-500/60 hover:border-emerald-400'],
  [['Dubstep', 'Deep Dubstep'], 'border-purple-500/60 hover:border-purple-400'],
  [['Hip-Hop', 'Rap'], 'border-orange-500/60 hover:border-orange-400'],
  [['Jazz'], 'border-yellow-500/60 hover:border-yellow-400'],
  [['Soul', 'Funk', 'Boogie'], 'border-pink-500/60 hover:border-pink-400'],
  [['Reggae', 'Dub', 'Dancehall'], 'border-lime-500/60 hover:border-lime-400'],
  [['Disco', 'Nu-Disco'], 'border-fuchsia-500/60 hover:border-fuchsia-400'],
  [['Ambient', 'Downtempo', 'Trip-Hop'], 'border-teal-500/60 hover:border-teal-400'],
  [['Afro House', 'Afrobeats', 'Amapiano', 'Gqom'], 'border-rose-500/60 hover:border-rose-400'],
];

export function genreAccent(genres: string[]): string {
  for (const [matches, accent] of GENRE_ACCENTS) {
    if (genres.some((genre) => matches.includes(genre))) return accent;
  }
  return 'border-edge hover:border-accent/60';
}

// Show at most the top N genres — DJs accumulate long tag lists otherwise.
export function topGenres(genres: string[], limit = 5): string[] {
  return genres.slice(0, limit);
}
