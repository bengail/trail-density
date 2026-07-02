import { mean, stdPop } from './math.js';

export function normalizeItraFemaleIndex(score) {
  if (!Number.isFinite(score)) return NaN;
  return ((-0.000466 * score) + 1.532) * score;
}

export function topScoresFrom(results, n, limitByRank = true) {
  let valid = (results || [])
    .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index) && r.rank >= 1)
    .sort((a, b) => a.rank - b.rank);
  if (limitByRank) valid = valid.filter(r => r.rank <= n);
  return valid.slice(0, n).map(r => r.index);
}

export function rciFromResults(results, n, limitByRank = true) {
  const values = topScoresFrom(results, n, limitByRank);
  if (!values.length) return NaN;
  return mean(values) - stdPop(values);
}

export function getTopStats(results, n) {
  const values = topScoresFrom(results, n, false);
  if (!values.length) return { mean: NaN, std: NaN, rci: NaN };
  const m = mean(values);
  const sd = stdPop(values);
  return { mean: m, std: sd, rci: m - sd };
}
