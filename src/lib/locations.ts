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
