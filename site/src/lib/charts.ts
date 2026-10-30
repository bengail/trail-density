// SVG charts as plain strings: rendered at build time and re-rendered in the browser when the edition changes.
// Colours come from CSS classes (.m / .f), so light and dark themes need nothing here.
import type { Edition, GenderBlock } from "./types";

const W = 720;
const PAD = { top: 16, right: 44, bottom: 28, left: 40 };

function niceRange(values: number[], step: number, pad = 0) {
  const lo = Math.floor((Math.min(...values) - pad) / step) * step;
  const hi = Math.ceil((Math.max(...values) + pad) / step) * step;
  return [lo, hi === lo ? lo + step : hi];
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function yAxis(lo: number, hi: number, step: number, y: (v: number) => number, width: number) {
  let out = "";
  for (let v = lo; v <= hi; v += step) {
    out += `<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`;
    out += `<text class="tick" x="${PAD.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  return out;
}

// RCI10 per edition, one line per gender (primary source); a second source, if given, as dashed lines.
export function historyChart(editions: Edition[], labels: { M: string; F: string }, alt?: { source: string; label: string }, height = 260) {
  const pts = { M: [] as [number, number][], F: [] as [number, number][] };
  const altPts = { M: [] as [number, number][], F: [] as [number, number][] };
  for (const e of [...editions].sort((a, b) => a.year - b.year)) {
    for (const g of ["M", "F"] as const) {
      if (e[g]?.rci10 != null) pts[g].push([e.year, e[g]!.rci10!]);
      const a = alt && e.source !== alt.source ? e.sources[alt.source]?.[g]?.rci10 : null;
      if (a != null) altPts[g].push([e.year, a]);
    }
  }
  const all = [...pts.M, ...pts.F, ...altPts.M, ...altPts.F];
  if (all.length < 2) return "";
  const years = all.map(p => p[0]);
  const x0 = Math.min(...years), x1 = Math.max(...years);
  const [lo, hi] = niceRange(all.map(p => p[1]), 50, 5);
  const x = (v: number) => PAD.left + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (height - PAD.top - PAD.bottom);

  let svg = yAxis(lo, hi, 50, y, W);
  const span = x1 - x0, every = span > 16 ? 5 : span > 8 ? 2 : 1;
  for (let yr = x0; yr <= x1; yr++) {
    if ((yr - x0) % every && yr !== x1) continue;
    svg += `<text class="tick" x="${x(yr)}" y="${height - 8}" text-anchor="middle">${yr}</text>`;
  }
  // End labels: keep them apart when both genders finish at nearly the same value.
  const ends = Object.fromEntries((["M", "F"] as const).filter(g => pts[g].length).map(g => [g, y(pts[g][pts[g].length - 1][1])]));
  if (ends.M != null && ends.F != null && Math.abs(ends.M - ends.F) < 16) {
    const midY = (ends.M + ends.F) / 2, upper = ends.M <= ends.F ? "M" : "F";
    ends[upper] = midY - 8; ends[upper === "M" ? "F" : "M"] = midY + 8;
  }
  for (const g of ["M", "F"] as const) {
    const p = altPts[g];
    if (!p.length) continue;
    svg += `<polyline class="line alt ${g.toLowerCase()}" points="${p.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")}"/>`;
    svg += p.map(([a, b]) => `<circle class="hit" cx="${x(a)}" cy="${y(b)}" r="5"><title>${a} · ${esc(labels[g])} · ${esc(alt!.label)} ${b.toFixed(1)}</title></circle>`).join("");
  }
  for (const g of ["M", "F"] as const) {
    const p = pts[g];
    if (!p.length) continue;
    svg += `<polyline class="line ${g.toLowerCase()}" points="${p.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")}"/>`;
    for (const [a, b] of p) {
      svg += `<circle class="dot ${g.toLowerCase()}" cx="${x(a)}" cy="${y(b)}" r="4"><title>${a} · ${esc(labels[g])} ${b.toFixed(1)}</title></circle>`;
    }
    const [la, lb] = p[p.length - 1];
    svg += `<text class="end-label ${g.toLowerCase()}" x="${x(la) + 8}" y="${ends[g] + 4}">${Math.round(lb)}</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${svg}</svg>`;
}

// Index of the top 50, rank by rank.
export function densityChart(blocks: { M?: GenderBlock; F?: GenderBlock }, labels: { M: string; F: string }, height = 260) {
  const curves = (["M", "F"] as const).filter(g => blocks[g]?.curve.length);
  if (!curves.length) return "";
  const n = Math.max(...curves.map(g => blocks[g]!.curve.length));
  const [lo, hi] = niceRange(curves.flatMap(g => blocks[g]!.curve), 100);
  const x = (rank: number) => PAD.left + ((rank - 1) / Math.max(1, n - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (height - PAD.top - PAD.bottom);

  let svg = yAxis(lo, hi, 100, y, W);
  for (const r of [1, 10, 20, 30, 40, 50].filter(r => r <= n)) {
    svg += `<text class="tick" x="${x(r)}" y="${height - 8}" text-anchor="middle">${r}</text>`;
  }
  svg += `<line class="marker" x1="${x(10)}" x2="${x(10)}" y1="${PAD.top}" y2="${height - PAD.bottom}"/>`;
  for (const g of curves) {
    const c = blocks[g]!.curve;
    const cls = g.toLowerCase();
    svg += `<polyline class="line ${cls}" points="${c.map((v, i) => `${x(i + 1)},${y(v)}`).join(" ")}"/>`;
    svg += c.map((v, i) => `<circle class="hit" cx="${x(i + 1)}" cy="${y(v)}" r="5"><title>${esc(labels[g])} · ${i + 1} · ${v}</title></circle>`).join("");
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${svg}</svg>`;
}

// Mirrored histogram of the whole field: men to the left, women to the right, in % of each field.
export function fieldChart(blocks: { M?: GenderBlock; F?: GenderBlock }, height = 300) {
  const gs = (["M", "F"] as const).filter(g => blocks[g]?.n);
  if (!gs.length) return "";
  const h = blocks[gs[0]]!.hist;
  const share = Object.fromEntries(gs.map(g => {
    const counts = blocks[g]!.hist.counts, total = counts.reduce((a, b) => a + b, 0) || 1;
    return [g, counts.map(c => c / total)];
  })) as Record<"M" | "F", number[]>;
  const used = h.counts.map((_, i) => gs.some(g => share[g][i] > 0));
  const first = used.indexOf(true), last = used.lastIndexOf(true);
  const bins = last - first + 1;
  const max = Math.max(...gs.flatMap(g => share[g]));
  const mid = W / 2, half = mid - 56;
  const rowH = (height - 8) / bins;

  let svg = "";
  for (let k = 0; k < bins; k++) {
    const i = last - k;                                       // highest index on top
    const yy = 4 + k * rowH;
    const from = h.start + i * h.step;
    if (i % 2 === 0 || bins < 14) svg += `<text class="tick" x="${mid}" y="${yy + rowH / 2 + 4}" text-anchor="middle">${from}</text>`;
    for (const g of gs) {
      const v = share[g][i];
      if (!v) continue;
      const len = (v / max) * half;
      const xx = g === "M" ? mid - 28 - len : mid + 28;
      svg += `<rect class="bar ${g.toLowerCase()}" x="${xx}" y="${yy + 1}" width="${len}" height="${Math.max(1, rowH - 2)}" rx="2"><title>${from}–${from + h.step - 1} · ${(v * 100).toFixed(1)} %</title></rect>`;
    }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${svg}</svg>`;
}
