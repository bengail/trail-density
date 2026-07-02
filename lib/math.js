export function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function stdPop(arr) {
  if (arr.length < 1) return NaN;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
  return Math.sqrt(v);
}

export function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}
