import { getPool, slugify } from './lib/db.mjs';

const pool = getPool();

// Curated from public knowledge. Scrapers enrich/verify these fields over time.
// No links included unless verified at seed time — scrapers add them.
const djs = [
  {
    name: 'Dick Johnson',
    bio: 'Veteran Wellington DJ and radio host active since the 1980s. Long-running figure of the Wellington music scene.',
    genres: ['eclectic', 'funk', 'soul'],
  },
  {
    name: 'DJ Fitchie',
    bio: 'Wellington DJ and producer, founding member of Fat Freddy\'s Drop. Long-running selector across funk, reggae, soul and hip-hop.',
    genres: ['funk', 'reggae', 'soul', 'hip-hop'],
  },
  {
    name: 'DJ CXL',
    bio: 'Wellington drum & bass DJ and producer. Regular on the NZ DnB circuit.',
    genres: ['drum & bass'],
  },
  {
    name: 'Frank Booker',
    bio: 'Wellington-based DJ and producer known for house, boogie and disco selections, plus studio work.',
    genres: ['house', 'boogie', 'disco'],
  },
  {
    name: 'Sian',
    bio: 'Wellington-born techno DJ and producer who has toured internationally. Known for driving, industrial-leaning techno.',
    genres: ['techno'],
  },
  {
    name: 'State of Mind',
    bio: 'Wellington drum & bass production and DJ duo, signed and touring internationally since the mid-2000s.',
    genres: ['drum & bass'],
  },
  {
    name: 'Concord Dawn',
    bio: 'Wellington drum & bass duo with a long catalogue on NZ and international labels.',
    genres: ['drum & bass'],
  },
  {
    name: 'Broderbeats',
    bio: 'Wellington DJ. Name surfaced in coverage of ULTRA NZ 2026.',
    genres: [],
  },
];

const venues = [
  { id: 'san-fran', name: 'San Fran', address: '171 Cuba Street, Te Aro, Wellington' },
  { id: 'meow', name: 'Meow', address: '9 Edward Street, Te Aro, Wellington' },
  { id: 'valhalla', name: 'Valhalla', address: '154 Vivian Street, Te Aro, Wellington' },
  { id: 'caroline', name: 'Caroline', address: '1 Ghuznee Street, Te Aro, Wellington' },
  { id: 'ivy-bar', name: 'Ivy Bar', address: '67-69 Courtenay Place, Wellington' },
  { id: 'sly-bar', name: 'Sly Bar', address: '2/35 Ghuznee Street, Te Aro, Wellington' },
  { id: 'deadpool', name: 'Deadpool', address: null },
  { id: 'the-third-eye', name: 'The Third Eye', address: null },
  { id: 'rogue-vagabond', name: 'The Rogue & Vagabond', address: '18 Garrett Street, Te Aro, Wellington' },
  { id: 'moon', name: 'Moon', address: '13 Wigan Street, Te Aro, Wellington' },
];

for (const dj of djs) {
  await pool.query(
    `INSERT INTO djs (id, name, bio, genres, source, data_completeness)
     VALUES ($1, $2, $3, $4, 'seed', 30)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, bio = EXCLUDED.bio, genres = EXCLUDED.genres`,
    [slugify(dj.name), dj.name, dj.bio, dj.genres],
  );
}

for (const venue of venues) {
  await pool.query(
    `INSERT INTO venues (id, name, address) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address`,
    [venue.id, venue.name, venue.address],
  );
}

console.log(`Seeded ${djs.length} DJs, ${venues.length} venues.`);
await pool.end();
