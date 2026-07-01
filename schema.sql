-- Trail Density — Supabase schema
-- Apply via Supabase MCP apply_migration (do not run directly in SQL editor).

-- ── races ──────────────────────────────────────────────────────────────────────
-- Base race entity: year-agnostic identity. One row per race/distance variant.

CREATE TABLE IF NOT EXISTS public.races (
  id             text        PRIMARY KEY,         -- slug: "utmb-170", "ccc-101"
  name           text        NOT NULL,            -- stable display name
  country        text,
  distance_km    numeric,
  elevation_gain int,
  itra_race_url  text,                            -- base ITRA URL (no year)
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ── editions ───────────────────────────────────────────────────────────────────
-- One row per race × year. Carries year-specific metadata incl. series tags.

CREATE TABLE IF NOT EXISTS public.editions (
  id                text        PRIMARY KEY,      -- "utmb-170-2024"
  race_id           text        NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  year              int         NOT NULL,
  date              date,
  series            text[],                       -- ["utmb-world-series", "gtws"]
  itra_edition_url  text,
  imported_at       timestamptz DEFAULT now(),
  UNIQUE (race_id, year)
);

-- ── results ────────────────────────────────────────────────────────────────────
-- One row per finisher per edition.

CREATE TABLE IF NOT EXISTS public.results (
  id          bigserial   PRIMARY KEY,
  edition_id  text        NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  rank        int         NOT NULL,
  gender      text        CHECK (gender IN ('M', 'F')),
  index       numeric     NOT NULL,
  runner      text,
  nationality text
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS results_edition_id_idx        ON public.results (edition_id);
CREATE INDEX IF NOT EXISTS results_edition_id_gender_idx ON public.results (edition_id, gender);

-- ── Row-Level Security ─────────────────────────────────────────────────────────

ALTER TABLE public.races    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results  ENABLE ROW LEVEL SECURITY;

-- Public read (anon key)
CREATE POLICY "public read" ON public.races    FOR SELECT USING (true);
CREATE POLICY "public read" ON public.editions FOR SELECT USING (true);
CREATE POLICY "public read" ON public.results  FOR SELECT USING (true);

-- Admin write (must be in admins table)
CREATE POLICY "admin write" ON public.races    FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins WHERE email = auth.email())
);
CREATE POLICY "admin write" ON public.editions FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins WHERE email = auth.email())
);
CREATE POLICY "admin write" ON public.results  FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins WHERE email = auth.email())
);
