-- Trail Density — schema v2
-- Built side by side with the legacy public.* tables; the public site keeps running on public.*
-- until the switch. Written only by scripts/import.mjs (direct Postgres connection), read by anon.
--
--   events ─< races ─< editions ─< result_sets ─< results
--                                └< edition_stats   (precomputed, what the web client reads)

CREATE SCHEMA IF NOT EXISTS v2;

-- ── events ─────────────────────────────────────────────────────────────────────
-- A festival / organiser umbrella (UTMB Mont-Blanc, Festival des Templiers, …).
CREATE TABLE v2.events (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  country     char(2),                                  -- ISO 3166-1 alpha-2
  website     text
);

-- ── races ──────────────────────────────────────────────────────────────────────
-- A canonical race, stable across sponsor renames ("ccc", "utmb", "zegama").
CREATE TABLE v2.races (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  event_id        text NOT NULL REFERENCES v2.events(id) ON DELETE CASCADE,
  name            text NOT NULL,
  discipline      text NOT NULL DEFAULT 'trail' CHECK (discipline IN ('trail', 'uphill', 'skyrace')),
  distance_km     numeric CHECK (distance_km > 0),        -- typical course; editions may override
  elevation_gain  int     CHECK (elevation_gain >= 0),
  series          text[]  NOT NULL DEFAULT '{}'           -- default series tags; editions may override
);

-- ── editions ───────────────────────────────────────────────────────────────────
-- One race × year. Course metadata lives here because courses change between years.
CREATE TABLE v2.editions (
  id              text PRIMARY KEY,                       -- "{race_id}-{year}"
  race_id         text NOT NULL REFERENCES v2.races(id) ON DELETE CASCADE,
  year            int  NOT NULL CHECK (year BETWEEN 1970 AND 2100),
  date            date,
  distance_km     numeric CHECK (distance_km > 0),
  elevation_gain  int     CHECK (elevation_gain >= 0),
  series          text[]  NOT NULL DEFAULT '{}',
  itra_id         int  UNIQUE,                            -- per-race ITRA id (never the event-level one)
  itra_url        text,
  utmb_uri        text UNIQUE,                            -- "141.hokautmbmont-blancccc.2025"
  UNIQUE (race_id, year),
  CHECK (id = race_id || '-' || year)
);

-- ── result_sets ────────────────────────────────────────────────────────────────
-- One import of one source for one edition. ITRA and UTMB results of the same race
-- are two result sets of the same edition.
CREATE TABLE v2.result_sets (
  id           bigserial PRIMARY KEY,
  edition_id   text NOT NULL REFERENCES v2.editions(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('itra', 'utmb', 'legacy')),
  fetched_at   timestamptz NOT NULL,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  raw_file     text,                                      -- data/raw/… path of the cached payload
  raw_sha256   text,
  n_results    int  NOT NULL,
  n_female     int  NOT NULL,
  warnings     text[] NOT NULL DEFAULT '{}',              -- non-blocking validation notes
  UNIQUE (edition_id, source)
);

-- ── results ────────────────────────────────────────────────────────────────────
CREATE TABLE v2.results (
  result_set_id  bigint   NOT NULL REFERENCES v2.result_sets(id) ON DELETE CASCADE,
  rank           int      NOT NULL CHECK (rank >= 1),     -- overall rank as published (ties allowed)
  gender_rank    int      CHECK (gender_rank >= 1),
  gender         char(1)  CHECK (gender IN ('M', 'F')),
  index          numeric  NOT NULL CHECK (index > 0 AND index < 1200),
  runner         text,
  nationality    char(2),                                -- ISO 3166-1 alpha-2
  time_s         int      CHECK (time_s > 0)
);
CREATE INDEX results_set_gender_rank_idx ON v2.results (result_set_id, gender, gender_rank);

-- ── edition_stats ──────────────────────────────────────────────────────────────
-- Precomputed per edition × source × gender by the import script. The web client and
-- the future MCP read only this (plus metadata) — never raw results.
CREATE TABLE v2.edition_stats (
  edition_id     text    NOT NULL REFERENCES v2.editions(id) ON DELETE CASCADE,
  source         text    NOT NULL,
  gender         char(1) NOT NULL CHECK (gender IN ('M', 'F')),
  n_finishers    int     NOT NULL,
  normalization  text    NOT NULL,                        -- e.g. 'none', 'itra-female-quadratic'
  rci3           numeric,
  rci5           numeric,
  rci10          numeric,
  rci20          numeric,
  top_scores     numeric[] NOT NULL,                      -- top 50 indexes by gender rank (raw), for depth curves
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edition_id, source, gender),
  FOREIGN KEY (edition_id, source) REFERENCES v2.result_sets (edition_id, source) ON DELETE CASCADE
);

-- ── Read-friendly view ─────────────────────────────────────────────────────────
CREATE VIEW v2.edition_overview WITH (security_invoker = true) AS
SELECT e.id            AS edition_id,
       e.year, e.date,
       r.id            AS race_id,
       r.name          AS race_name,
       ev.id           AS event_id,
       ev.name         AS event_name,
       ev.country,
       r.discipline,
       COALESCE(e.distance_km, r.distance_km)       AS distance_km,
       COALESCE(e.elevation_gain, r.elevation_gain) AS elevation_gain,
       CASE WHEN cardinality(e.series) > 0 THEN e.series ELSE r.series END AS series,
       CASE
         WHEN r.discipline = 'uphill'                         THEN 'vertical'
         WHEN COALESCE(e.distance_km, r.distance_km) IS NULL  THEN NULL
         WHEN COALESCE(e.distance_km, r.distance_km) <  30    THEN 'short'
         WHEN COALESCE(e.distance_km, r.distance_km) <  60    THEN 'medium'
         WHEN COALESCE(e.distance_km, r.distance_km) < 120    THEN 'long'
         ELSE 'ultra'
       END AS format
FROM v2.editions e
JOIN v2.races  r  ON r.id = e.race_id
JOIN v2.events ev ON ev.id = r.event_id;

-- ── Access ─────────────────────────────────────────────────────────────────────
-- Public read-only. No write policies: only the import script (postgres role) writes.
GRANT USAGE ON SCHEMA v2 TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA v2 TO anon, authenticated;

ALTER TABLE v2.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.races         ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.editions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.result_sets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.edition_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON v2.events        FOR SELECT USING (true);
CREATE POLICY "public read" ON v2.races         FOR SELECT USING (true);
CREATE POLICY "public read" ON v2.editions      FOR SELECT USING (true);
CREATE POLICY "public read" ON v2.result_sets   FOR SELECT USING (true);
CREATE POLICY "public read" ON v2.results       FOR SELECT USING (true);
CREATE POLICY "public read" ON v2.edition_stats FOR SELECT USING (true);
