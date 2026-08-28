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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venues (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  address       TEXT,
  url           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_djs_genres ON djs USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_djs_name_trgm ON djs USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_dj ON events(dj_id);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_profile_views_dj ON profile_views(dj_id);
CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at);
