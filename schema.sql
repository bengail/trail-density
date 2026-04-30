-- Trail Density — Supabase schema
-- Run this in the Supabase SQL Editor before running scripts/migrate.py

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id      text        UNIQUE NOT NULL,
  name         text,
  series       text[],
  country      text,
  year         int,
  distance_km  numeric,
  elevation_m  numeric,
  prize_money  numeric,
  data_source  text,
  source_url   text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS results (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rank         int     NOT NULL,
  runner       text,
  index        numeric NOT NULL,
  gender       text    CHECK (gender IN ('M', 'F')),
  nationality  text
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS results_course_id_idx        ON results (course_id);
CREATE INDEX IF NOT EXISTS results_course_id_gender_idx ON results (course_id, gender);
CREATE INDEX IF NOT EXISTS courses_race_id_idx          ON courses  (race_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE results  ENABLE ROW LEVEL SECURITY;

-- Public read (anon key)
CREATE POLICY "public_read_courses" ON courses FOR SELECT USING (true);
CREATE POLICY "public_read_results"  ON results  FOR SELECT USING (true);

-- Authenticated write (admin only)
CREATE POLICY "auth_insert_courses" ON courses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_courses" ON courses FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_courses" ON courses FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_insert_results" ON results FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_results" ON results FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_results" ON results FOR DELETE USING (auth.uid() IS NOT NULL);
