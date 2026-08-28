import pg from 'pg';

export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set. Copy .env.example to .env.local and set it.');
  }
  return new pg.Pool({ connectionString: url });
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
