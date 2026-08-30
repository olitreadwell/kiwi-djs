// NZ city/country detection shared by enrichment and the dossier so a DJ
// whose profile says "Queenstown" is never called a Wellington DJ.
export const NZ_CITIES = new Set([
  'wellington', 'auckland', 'christchurch', 'dunedin', 'hamilton', 'tauranga',
  'queenstown', 'nelson', 'napier', 'palmerston north', 'rotorua', 'new plymouth',
  'whanganui', 'gisborne', 'timaru', 'invercargill', 'whangarei', 'hastings',
  'lower hutt', 'upper hutt', 'porirua', 'taupo', 'wanaka', 'blenheim', 'greymouth',
  'oamaru', 'ashburton', 'masterton', 'levin', 'te anau', 'havelock north',
  'cambridge', 'te awamutu', 'matamata', 'tokoroa', 'paraparaumu', 'waikanae',
  'rangiora', 'kaiapoi', 'rolleston', 'lincoln', 'methven', 'twizel', 'geraldine',
  'waimate', 'temuka', 'westport', 'hokitika', 'kaikoura', 'kerikeri', 'pukekohe',
  'whakatane', 'opotiki', 'marton', 'feilding', 'dannewirke', 'waiheke island',
]);

export function isNzLocation(city?: string, country?: string, countryCode?: string): boolean {
  if (countryCode?.toUpperCase() === 'NZ') return true;
  if (country && /new zealand|aotearoa|\bnz\b/i.test(country)) return true;
  if (city && NZ_CITIES.has(city.trim().toLowerCase())) return true;
  return false;
}

// The NZ city named in a profile location string, e.g. "SoundCloud:
// Queenstown, New Zealand" → "Queenstown". Null when none is named.
export function cityFromLocation(profileLocation: string | null | undefined): string | null {
  if (!profileLocation) return null;
  const lower = profileLocation.toLowerCase();
  for (const city of NZ_CITIES) {
    if (lower.includes(city)) return city;
  }
  return null;
}

// True when a stored profile location string names New Zealand (a city,
// "New Zealand", "Aotearoa" or "NZ").
export function isNzProfileLocation(profileLocation: string | null | undefined): boolean {
  if (!profileLocation) return true;
  return cityFromLocation(profileLocation) !== null || /new zealand|aotearoa|\bnz\b/i.test(profileLocation);
}

// Well-known non-NZ countries, cities and metro areas, used to tell a
// genuinely non-NZ profile location ("SoundCloud: Melbourne") apart from an
// ambiguous one ("SoundCloud: Everywhere") that should not be judged.
export const NON_NZ_PLACES = new Set([
  'us', 'usa', 'united states', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'britain', 'ireland',
  'australia', 'melbourne', 'sydney', 'adelaide', 'brisbane', 'perth', 'canberra',
  'canada', 'vancouver', 'toronto', 'montreal',
  'germany', 'berlin', 'france', 'paris', 'netherlands', 'amsterdam', 'japan', 'tokyo',
  'south korea', 'korea', 'seoul', 'china', 'hong kong', 'singapore', 'india', 'thailand', 'indonesia',
  'los angeles', 'new york', 'chicago', 'miami', 'tampa', 'denver', 'seattle', 'san francisco',
  'atlanta', 'houston', 'dallas', 'boston', 'detroit', 'dmv', 'virginia', 'maryland', 'washington dc',
  'spain', 'italy', 'sweden', 'norway', 'denmark', 'belgium', 'switzerland', 'austria', 'poland',
  'russia', 'brazil', 'mexico', 'argentina', 'chile', 'south africa', 'nigeria', 'dubai',
  'london', 'glasgow', 'edinburgh', 'manchester', 'dublin', 'berlin', 'amsterdam', 'paris',
]);

const NON_NZ_PATTERNS: RegExp[] = [...NON_NZ_PLACES].map(
  (place) => new RegExp(`\\b${place.replace(/ /g, '\\s+')}\\b`),
);

export type ProfileLocationClass = 'nz' | 'non-nz' | 'unknown';

// Classify a stored profile location string: 'nz' when it names a NZ city
// or country, 'non-nz' when it names a known overseas place, 'unknown' when
// it is ambiguous ("Everywhere") or not a location at all ("a.k.a. X").
export function classifyProfileLocation(profileLocation: string | null | undefined): ProfileLocationClass {
  if (!profileLocation) return 'unknown';
  const lower = profileLocation.toLowerCase();
  if (cityFromLocation(lower) !== null || /new zealand|aotearoa|\bnz\b/i.test(lower)) return 'nz';
  for (const pattern of NON_NZ_PATTERNS) {
    if (pattern.test(lower)) return 'non-nz';
  }
  return 'unknown';
}

// NZ evidence for a DJ: a profile location source that names NZ. Playing
// NZ gigs does not make someone an NZ DJ (a touring act can play one NZ
// festival), so gigs are deliberately not counted here (#321).
export function hasNzLocationEvidence(verificationSources: string[]): boolean {
  return verificationSources.includes('location');
}
