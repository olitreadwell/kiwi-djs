-- Wellington DJs — schema
-- Postgres 16. Applied idempotently by scripts/migrate.mjs

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS djs (
  id            TEXT PRIMARY KEY,            -- slug, e.g. "dick-johnson"
  name          TEXT NOT NULL,
  bio           TEXT,
  genres        TEXT[] NOT NULL DEFAULT '{}',
  city          TEXT NOT NULL DEFAULT 'Wellington',
  image_url     TEXT,
  soundcloud_url TEXT,
  instagram_url TEXT,
  facebook_url  TEXT,
  mixcloud_url  TEXT,
  website_url   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  popularity    INTEGER NOT NULL DEFAULT 0,  -- derived from analytics
  data_completeness INTEGER NOT NULL DEFAULT 0, -- 0-100, drives self-improvement
  source        TEXT NOT NULL DEFAULT 'seed',
  opt_out       BOOLEAN NOT NULL DEFAULT FALSE,
  mixcloud_backoff_until TIMESTAMPTZ,        -- rate-limit hold until (Mixcloud 429)
  discovery_note TEXT,                       -- junk/seen on unverified candidates
  verification_level INTEGER NOT NULL DEFAULT 0, -- 0 candidate, 1 listed, 2+ verified (evidence-weighted)
  verification_sources TEXT[] NOT NULL DEFAULT '{}', -- evidence categories: mixes, links, articles, gigs
  is_nz          BOOLEAN NOT NULL DEFAULT TRUE, -- public list is Aotearoa/NZ-only
  bpm_range      TEXT,                          -- e.g. "128-140" from track BPMs (#35)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotent column adds for pre-existing tables
ALTER TABLE djs ADD COLUMN IF NOT EXISTS mixcloud_backoff_until TIMESTAMPTZ;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS discovery_note TEXT;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS verification_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS verification_sources TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE djs ADD COLUMN IF NOT EXISTS is_nz BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS bpm_range TEXT;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ;   -- set when no gig/article activity for 12+ months (#138)
ALTER TABLE djs ADD COLUMN IF NOT EXISTS bio_quality TEXT;          -- 'low' | 'ok' from bio quality audit (#142)

CREATE TABLE IF NOT EXISTS venues (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  address       TEXT,
  url           TEXT,
  region        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS region TEXT;

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  dj_id         TEXT REFERENCES djs(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  venue         TEXT,
  starts_at     TIMESTAMPTZ,
  url           TEXT,
  source        TEXT NOT NULL DEFAULT 'seed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One event row per festival/venue night; event_djs links every DJ on the
-- lineup so a festival is not duplicated per DJ (#16).
CREATE TABLE IF NOT EXISTS event_djs (
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, dj_id)
);

CREATE TABLE IF NOT EXISTS scrapes (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  status        TEXT NOT NULL,               -- ok | partial | error
  items_found   INTEGER NOT NULL DEFAULT 0,
  items_new     INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS search_events (
  id            BIGSERIAL PRIMARY KEY,
  query         TEXT NOT NULL,
  results       INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_views (
  id            BIGSERIAL PRIMARY KEY,
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS changelog (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  entry         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dj_links (
  id            TEXT PRIMARY KEY,            -- djId-type-slug
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,               -- soundcloud | mixcloud | instagram | facebook | website | spotify | news
  url           TEXT NOT NULL,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dj_articles (
  id            TEXT PRIMARY KEY,            -- djId-<hash>
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT,
  published_at  TIMESTAMPTZ,
  snippet       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dj_mixes (
  id            TEXT PRIMARY KEY,            -- djId-platform-slug
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,               -- soundcloud | mixcloud
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'mix', -- mix | interview
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dj_mixes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'mix';

CREATE TABLE IF NOT EXISTS dj_aliases (
  dj_id         TEXT NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  alias         TEXT NOT NULL,
  PRIMARY KEY (dj_id, alias)
);

-- Public suggestions for updated info (#15): users propose corrections to
-- a DJ dossier. Reviewed before any data change.
CREATE TABLE IF NOT EXISTS suggestions (
  id              BIGSERIAL PRIMARY KEY,
  dj_id           TEXT REFERENCES djs(id) ON DELETE SET NULL,
  dj_name         TEXT,
  field           TEXT NOT NULL,
  current_value   TEXT,
  suggested_value TEXT NOT NULL,
  source_url      TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | reviewed | rejected
  ip_hash         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event orgs / collectives (#18) and soundsystems (#19) are their own
-- entities, never DJs.
CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT,
  description TEXT,
  website     TEXT,
  instagram   TEXT,
  facebook    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soundsystems (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT,
  style       TEXT,
  description TEXT,
  website     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_djs_genres ON djs USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_djs_name_trgm ON djs USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_dj ON events(dj_id);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_profile_views_dj ON profile_views(dj_id);
CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at);
CREATE INDEX IF NOT EXISTS idx_dj_links_dj ON dj_links(dj_id);
CREATE INDEX IF NOT EXISTS idx_dj_articles_dj ON dj_articles(dj_id);
CREATE INDEX IF NOT EXISTS idx_dj_mixes_dj ON dj_mixes(dj_id);
