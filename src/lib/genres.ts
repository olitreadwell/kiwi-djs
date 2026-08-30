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

// Genre color per genre (#52/#283). Every genre gets its own color so the
// pills on a card are individually distinguishable; the card tint follows
// the top genre. Tailwind classes must be static literals, dark-bg
// friendly. Iconic genres are anchored to a semantic color (psytrance =
// purple, drum and bass = red, house = amber); the rest hash onto the
// palette so new genres always get a distinct color.
const GENRE_PALETTE: Array<{ pill: string; tint: string }> = [
  { pill: 'bg-red-500 text-white', tint: 'border-red-500/60 bg-red-500/10 hover:bg-red-500/20' },
  { pill: 'bg-orange-500 text-white', tint: 'border-orange-500/60 bg-orange-500/10 hover:bg-orange-500/20' },
  { pill: 'bg-amber-500 text-black', tint: 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20' },
  { pill: 'bg-yellow-500 text-black', tint: 'border-yellow-500/60 bg-yellow-500/10 hover:bg-yellow-500/20' },
  { pill: 'bg-lime-500 text-black', tint: 'border-lime-500/60 bg-lime-500/10 hover:bg-lime-500/20' },
  { pill: 'bg-green-500 text-white', tint: 'border-green-500/60 bg-green-500/10 hover:bg-green-500/20' },
  { pill: 'bg-emerald-500 text-white', tint: 'border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20' },
  { pill: 'bg-teal-500 text-white', tint: 'border-teal-500/60 bg-teal-500/10 hover:bg-teal-500/20' },
  { pill: 'bg-cyan-500 text-black', tint: 'border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/20' },
  { pill: 'bg-sky-500 text-white', tint: 'border-sky-500/60 bg-sky-500/10 hover:bg-sky-500/20' },
  { pill: 'bg-blue-500 text-white', tint: 'border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/20' },
  { pill: 'bg-indigo-500 text-white', tint: 'border-indigo-500/60 bg-indigo-500/10 hover:bg-indigo-500/20' },
  { pill: 'bg-violet-500 text-white', tint: 'border-violet-500/60 bg-violet-500/10 hover:bg-violet-500/20' },
  { pill: 'bg-purple-500 text-white', tint: 'border-purple-500/60 bg-purple-500/10 hover:bg-purple-500/20' },
  { pill: 'bg-fuchsia-500 text-white', tint: 'border-fuchsia-500/60 bg-fuchsia-500/10 hover:bg-fuchsia-500/20' },
  { pill: 'bg-pink-500 text-white', tint: 'border-pink-500/60 bg-pink-500/10 hover:bg-pink-500/20' },
  { pill: 'bg-rose-500 text-white', tint: 'border-rose-500/60 bg-rose-500/10 hover:bg-rose-500/20' },
  { pill: 'bg-stone-500 text-white', tint: 'border-stone-500/60 bg-stone-500/10 hover:bg-stone-500/20' },
  { pill: 'bg-red-400 text-white', tint: 'border-red-400/60 bg-red-400/10 hover:bg-red-400/20' },
  { pill: 'bg-orange-400 text-white', tint: 'border-orange-400/60 bg-orange-400/10 hover:bg-orange-400/20' },
  { pill: 'bg-amber-400 text-black', tint: 'border-amber-400/60 bg-amber-400/10 hover:bg-amber-400/20' },
  { pill: 'bg-yellow-400 text-black', tint: 'border-yellow-400/60 bg-yellow-400/10 hover:bg-yellow-400/20' },
  { pill: 'bg-lime-400 text-black', tint: 'border-lime-400/60 bg-lime-400/10 hover:bg-lime-400/20' },
  { pill: 'bg-green-400 text-white', tint: 'border-green-400/60 bg-green-400/10 hover:bg-green-400/20' },
  { pill: 'bg-emerald-400 text-white', tint: 'border-emerald-400/60 bg-emerald-400/10 hover:bg-emerald-400/20' },
  { pill: 'bg-teal-400 text-black', tint: 'border-teal-400/60 bg-teal-400/10 hover:bg-teal-400/20' },
  { pill: 'bg-cyan-400 text-black', tint: 'border-cyan-400/60 bg-cyan-400/10 hover:bg-cyan-400/20' },
  { pill: 'bg-sky-400 text-white', tint: 'border-sky-400/60 bg-sky-400/10 hover:bg-sky-400/20' },
  { pill: 'bg-blue-400 text-white', tint: 'border-blue-400/60 bg-blue-400/10 hover:bg-blue-400/20' },
  { pill: 'bg-indigo-400 text-white', tint: 'border-indigo-400/60 bg-indigo-400/10 hover:bg-indigo-400/20' },
  { pill: 'bg-violet-400 text-white', tint: 'border-violet-400/60 bg-violet-400/10 hover:bg-violet-400/20' },
  { pill: 'bg-purple-400 text-white', tint: 'border-purple-400/60 bg-purple-400/10 hover:bg-purple-400/20' },
  { pill: 'bg-fuchsia-400 text-white', tint: 'border-fuchsia-400/60 bg-fuchsia-400/10 hover:bg-fuchsia-400/20' },
  { pill: 'bg-pink-400 text-white', tint: 'border-pink-400/60 bg-pink-400/10 hover:bg-pink-400/20' },
  { pill: 'bg-rose-400 text-white', tint: 'border-rose-400/60 bg-rose-400/10 hover:bg-rose-400/20' },
  { pill: 'bg-stone-400 text-white', tint: 'border-stone-400/60 bg-stone-400/10 hover:bg-stone-400/20' },
];

// Iconic genres anchored to a semantic color; everything else hashes onto
// the palette. Sibling subgenres may share a hue (Liquid Funk vs Funk).
const CURATED_GENRE_COLORS: Record<string, number> = {
  'Drum and Bass': 0,
  'Liquid Drum and Bass': 16,
  'Liquid Funk': 15,
  Neurofunk: 18,
  Jungle: 6,
  House: 2,
  'Deep House': 3,
  'Tech House': 4,
  'Progressive House': 10,
  'Acid House': 9,
  'Melodic House & Techno': 27,
  Techno: 11,
  'Hard Techno': 30,
  'Minimal Techno': 17,
  'Melodic Techno': 12,
  'Acid Techno': 8,
  'Detroit Techno': 19,
  Trance: 13,
  Psytrance: 13,
  'Goa Trance': 32,
  Garage: 7,
  'UK Garage': 26,
  '2-Step': 5,
  Grime: 14,
  Dubstep: 31,
  'Deep Dubstep': 35,
  'Hip-Hop': 1,
  'R&B': 33,
  Jazz: 20,
  Soul: 34,
  Funk: 15,
  Boogie: 24,
  Reggae: 21,
  Dub: 28,
  Dancehall: 29,
  Disco: 14,
  'Nu-Disco': 14,
  Ambient: 7,
  Downtempo: 25,
  'Trip-Hop': 25,
  'Afro House': 16,
  Afrobeats: 16,
  Amapiano: 16,
  Gqom: 16,
  Electro: 8,
  'Bass Music': 31,
  Bass: 31,
  'Bass House': 4,
  Synthwave: 9,
  Minimal: 17,
  Hardcore: 18,
  Hardstyle: 30,
  'Happy Hardcore': 18,
  Gabber: 18,
  'Baile Funk': 15,
  Cumbia: 21,
  Latin: 1,
  World: 1,
  Pop: 15,
  'Dance-Pop': 15,
  'K-Pop': 15,
  Rock: 5,
  'Classic Rock': 5,
  'Psychedelic Rock': 5,
  AOR: 5,
  Alternative: 5,
  Indie: 5,
  Country: 2,
  Folk: 5,
  Classical: 11,
  Metal: 18,
  Punk: 18,
  Eclectic: 17,
  Experimental: 17,
  Lounge: 7,
  Chillout: 7,
  Electronic: 8,
  Dance: 2,
};

function genreColorIndex(genre: string): number {
  const curated = CURATED_GENRE_COLORS[genre];
  if (curated !== undefined) return curated;
  let hash = 0;
  for (const ch of genre) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % GENRE_PALETTE.length;
}

export function genreAccent(genres: string[]): string {
  for (const genre of genres) {
    return GENRE_PALETTE[genreColorIndex(genre)].tint;
  }
  return 'border-edge bg-surface hover:border-accent/60';
}

export function genrePill(genre: string): string {
  return GENRE_PALETTE[genreColorIndex(genre)].pill;
}

// Show at most the top N genres — DJs accumulate long tag lists otherwise.
export function topGenres(genres: string[], limit = 5): string[] {
  return genres.slice(0, limit);
}
