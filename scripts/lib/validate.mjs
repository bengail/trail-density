// Sanity checks run on parsed results before anything is written.
// errors block the edition; warnings are stored on the result set for later review.

// `context`: { year, expectedYear, previousCounts: number[], multiFile } — previousCounts are n_results of other
// editions; multiFile = legacy rankings split in several files (one winner per file is expected).
export function validateResults(results, context = {}) {
  const errors = [];
  const warnings = [];
  const n = results.length;

  if (!n) {
    errors.push("no scored finishers");
    return { errors, warnings, results };
  }

  // Exact duplicate rows (same rank + runner) — drop them, warn.
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = `${r.rank}|${r.runner}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length < n) warnings.push(`${n - deduped.length} duplicate rows removed`);

  // A festival-wide result set mixes several races: ranks restart, so the podium positions repeat.
  // A single tie for the win (Hardrock 2016) only duplicates rank 1.
  const countRank = k => deduped.filter(r => r.rank === k).length;
  const winners = countRank(1);
  if (winners > 1 && !context.multiFile) {
    if (countRank(2) > 1 || countRank(3) > 1) errors.push(`${winners} finishers ranked 1st and repeated podium ranks — looks like an event-level (multi-race) result set`);
    else warnings.push(`${winners} finishers tied for 1st`);
  }

  const minRank = Math.min(...deduped.map(r => r.rank));
  if (minRank > 3) errors.push(`results start at rank ${minRank} — top of the ranking missing`);

  const men = deduped.filter(r => r.gender === "M").length;
  const women = deduped.filter(r => r.gender === "F").length;
  const unknown = deduped.length - men - women;
  if (!men && !women) errors.push("no gender information");
  else if (!women) warnings.push("no women in results");
  else if (!men) warnings.push("no men in results");
  if (unknown / deduped.length > 0.05) warnings.push(`${unknown} finishers without gender`);

  if (context.expectedYear && context.year && context.expectedYear !== context.year) {
    errors.push(`source page is for ${context.year}, catalog says ${context.expectedYear}`);
  }

  const prev = (context.previousCounts || []).filter(x => x > 0).sort((a, b) => a - b);
  if (prev.length >= 2) {
    const median = prev[Math.floor(prev.length / 2)];
    if (deduped.length > median * 2.5) warnings.push(`${deduped.length} finishers vs median ${median} for other editions — check it is the right race`);
    if (deduped.length < median / 4) warnings.push(`${deduped.length} finishers vs median ${median} for other editions — partial results?`);
  }

  return { errors, warnings, results: deduped };
}
