import { normalizeItraFemaleIndex } from './rci.js';

export function normalizeSeries(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function normalizeGenderLabel(value) {
  if (!value) return null;
  const lower = value.toString().trim().toLowerCase();
  if (["m", "men", "man", "male", "homme", "h"].includes(lower)) return "male";
  if (["f", "women", "woman", "female", "femme", "w"].includes(lower)) return "female";
  return null;
}

export function inferRaceGender(meta) {
  const text = `${meta?.name || ""} ${meta?.race_id || ""}`.toLowerCase();
  if (text.includes("(men)") || text.includes(" men") || text.includes("(homme)") || text.includes(" homme")) return "male";
  if (text.includes("(women)") || text.includes(" women") || text.includes("(femme)") || text.includes(" femme")) return "female";
  return null;
}

export function filterResultsByGender(results, gender) {
  if (!gender) return results || [];
  return (results || []).filter(r => normalizeGenderLabel(r.gender) === gender);
}

export function normalizeCourse(course, fallbackRaceId) {
  const meta = course.meta || {};
  const raceId = meta.race_id || fallbackRaceId;
  return {
    ...course,
    meta: { ...meta, race_id: raceId, series: normalizeSeries(meta.series) },
    results: (course.results || [])
      .map(r => ({
        rank: Number(r.rank), index: Number(r.index),
        runner: r.runner ?? null, gender: r.gender ?? null, nationality: r.nationality ?? null
      }))
      .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index))
      .sort((a, b) => a.rank - b.rank)
  };
}

export function getRciResultsForMode(results, gender, normalizeFemale) {
  const filtered = filterResultsByGender(results, gender);
  if (!normalizeFemale || gender !== "female") return filtered;
  return filtered.map(r => ({ ...r, index: normalizeItraFemaleIndex(r.index) }));
}
