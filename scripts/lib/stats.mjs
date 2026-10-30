// Field-strength stats. RCI_N = mean(top N) − std_pop(top N) of the gender's best index scores.
// Same definition as app.js, so v2 numbers stay comparable with the current site.

export const RCI_LEVELS = [3, 5, 10, 20];
export const TOP_SCORES_KEPT = 50;

// Female scores are mapped onto the male scale before computing RCI: (a·s + b)·s, Enduraw's formulas
// (fitted on the top 160 women and men, one per scale), published by Distances+ in April 2025:
// https://distances.plus/communaute/trail-running-classement-teams-trail-composition-2025/
const FEMALE_TO_MALE = {
  "itra-female-quadratic": [-0.000466, 1.532],
  "utmb-female-quadratic": [-0.000397, 1.481],
};

export function normalizationFor(source, gender) {
  if (gender !== "F") return "none";
  return source === "utmb" ? "utmb-female-quadratic" : "itra-female-quadratic";
}

export function normalize(score, normalization) {
  const k = FEMALE_TO_MALE[normalization];
  return k ? (k[0] * score + k[1]) * score : score;
}

function rci(values) {
  if (!values.length) return null;
  const m = values.reduce((s, x) => s + x, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length);
  return Math.round((m - sd) * 100) / 100;
}

// Adds gender_rank (1..n within each gender, in overall-rank order) to results, in place.
export function assignGenderRanks(results) {
  const counters = { M: 0, F: 0 };
  for (const r of [...results].sort((a, b) => a.rank - b.rank)) {
    r.gender_rank = r.gender ? ++counters[r.gender] : null;
  }
  return results;
}

// → one row per gender that has finishers: { gender, n_finishers, normalization, rci3…rci20, top_scores }
export function computeEditionStats(results, source) {
  const rows = [];
  for (const gender of ["M", "F"]) {
    const field = results.filter(r => r.gender === gender).sort((a, b) => a.gender_rank - b.gender_rank);
    if (!field.length) continue;
    const normalization = normalizationFor(source, gender);
    const scores = field.map(r => normalize(r.index, normalization));
    const row = { gender, n_finishers: field.length, normalization, top_scores: field.slice(0, TOP_SCORES_KEPT).map(r => r.index) };
    for (const n of RCI_LEVELS) row[`rci${n}`] = field.length >= n ? rci(scores.slice(0, n)) : null;
    rows.push(row);
  }
  return rows;
}
