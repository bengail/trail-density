import { state } from './state.js';
import { normalizeCourse } from './lib/normalize.js';

let manifest = null;
export const courseCache = new Map();
export const courseMetaCache = new Map();

export async function loadManifest() {
  if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient
      .from("courses").select("id, race_id, race_slug").order("race_id");
    if (error) throw new Error("Supabase loadManifest: " + error.message);
    manifest = { courses: data.map(c => ({ race_id: c.race_id, race_slug: c.race_slug, id: c.id })) };
    return manifest.courses;
  }
  const resp = await fetch(`${state.assetPrefix}data/courses_index.json`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Cannot load courses_index.json");
  manifest = await resp.json();
  return manifest.courses || [];
}

export function getManifestEntries() {
  return (manifest && manifest.courses) || [];
}

export function getCourseMeta(raceId) {
  return courseMetaCache.get(raceId) || null;
}

export async function loadCourse(raceId) {
  if (courseCache.has(raceId)) return courseCache.get(raceId);

  if (window.supabaseClient) {
    const entry = getManifestEntries().find(c => c.race_id === raceId);
    if (!entry) throw new Error("Unknown race_id: " + raceId);

    const [metaResp, resultsResp] = await Promise.all([
      window.supabaseClient
        .from("courses")
        .select("id, race_id, race_slug, itra_id, name, series, country, year, distance_km, elevation_m, prize_money, data_source, source_url, notes")
        .eq("id", entry.id).single(),
      window.supabaseClient
        .from("results")
        .select("rank, runner, index, gender, nationality")
        .eq("course_id", entry.id).order("rank")
    ]);

    if (metaResp.error) throw new Error("Supabase course meta: " + metaResp.error.message);
    if (resultsResp.error) throw new Error("Supabase results: " + resultsResp.error.message);

    const c = metaResp.data;
    const normalized = normalizeCourse({
      meta: {
        race_id: c.race_id, race_slug: c.race_slug, itra_id: c.itra_id,
        name: c.name, series: c.series, country: c.country,
        year: c.year, distance_km: c.distance_km, elevation_m: c.elevation_m,
        prize_money: c.prize_money, data_source: c.data_source,
        source_url: c.source_url, notes: c.notes
      },
      results: resultsResp.data
    }, raceId);

    courseCache.set(raceId, normalized);
    courseMetaCache.set(raceId, normalized.meta);
    return normalized;
  }

  const entry = getManifestEntries().find(c => c.race_id === raceId);
  if (!entry) throw new Error("Unknown race_id: " + raceId);
  const resp = await fetch(`${state.assetPrefix}${entry.path}`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Cannot load course json: " + entry.path);
  const normalized = normalizeCourse(await resp.json(), raceId);
  courseCache.set(raceId, normalized);
  courseMetaCache.set(raceId, normalized.meta || {});
  return normalized;
}

export async function preloadAllCourseMeta() {
  if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient
      .from("courses")
      .select("id, race_id, race_slug, itra_id, name, series, country, year, distance_km, elevation_m, prize_money, data_source, source_url, notes")
      .order("race_id");
    if (error) throw new Error("Supabase preloadAllCourseMeta: " + error.message);
    for (const c of data) {
      courseMetaCache.set(c.race_id, {
        race_id: c.race_id, race_slug: c.race_slug, itra_id: c.itra_id ?? null,
        name: c.name, series: c.series || [],
        country: c.country, year: c.year, distance_km: c.distance_km,
        elevation_m: c.elevation_m, prize_money: c.prize_money,
        data_source: c.data_source, source_url: c.source_url, notes: c.notes
      });
    }
    return;
  }
  const entries = getManifestEntries();
  await Promise.all(entries.map(e => loadCourse(e.race_id).catch(() => null)));
}

export function getCourseLabel(course) {
  return course.meta?.name || course.meta?.race_id || course.race_id;
}

export function getMetaLabel(meta) {
  if (!meta?.year) return "-";
  return String(meta.year);
}

export function maxYearFromData() {
  let max = null;
  for (const c of getManifestEntries()) {
    const yr = getCourseMeta(c.race_id)?.year;
    if (yr && (max === null || yr > max)) max = yr;
  }
  return max;
}
