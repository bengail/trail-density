// Rankings from index.json, shared by the build (home, rankings page) and the browser (filters).
import { t, racePath, flag, fmtNum, fmtDelta, type Lang } from "./i18n";
import type { Format, Gender, RaceSummary } from "./types";

export type Season = "latest" | number;
const STALE_AFTER = 2;               // "latest" ignores races whose last edition is older than this many seasons
const MAX_DELTA_GAP = 2;             // no change shown against an edition more than this many seasons back

export interface Row {
  race: RaceSummary;
  year: number;
  rci10: number;
  n: number;
  delta: number | null;
  prev: { year: number; rci10: number } | null;
  history: [number, number][];       // [year, rci10] oldest first
}

export function seasons(races: RaceSummary[]) {
  return [...new Set(races.flatMap(r => r.editions.map(e => e.year)))].sort((a, b) => b - a);
}

export function rank(races: RaceSummary[], g: Gender, season: Season = "latest", format: Format | "all" = "all"): Row[] {
  const newest = seasons(races)[0];
  const rows: Row[] = [];
  for (const race of races) {
    if (format !== "all" && race.format !== format) continue;
    const eds = race.editions.filter(e => e[g]?.rci10 != null);           // newest first
    const i = season === "latest" ? 0 : eds.findIndex(e => e.year === season);
    const ed = eds[i];
    if (!ed || (season === "latest" && ed.year < newest - STALE_AFTER)) continue;
    const prev = eds[i + 1];
    rows.push({
      race, year: ed.year, rci10: ed[g]!.rci10!, n: ed[g]!.n,
      delta: prev && ed.year - prev.year <= MAX_DELTA_GAP ? ed[g]!.rci10! - prev[g]!.rci10! : null,
      prev: prev ? { year: prev.year, rci10: prev[g]!.rci10! } : null,
      history: eds.map(e => [e.year, e[g]!.rci10!] as [number, number]).reverse(),
    });
  }
  return rows.sort((a, b) => b.rci10 - a.rci10);
}

export function sparkline(history: [number, number][], g: Gender, w = 84, h = 24) {
  if (history.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const ys = history.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  const x0 = history[0][0], x1 = history[history.length - 1][0];
  const x = (v: number) => 2 + ((v - x0) / (x1 - x0 || 1)) * (w - 6);
  const y = (v: number) => h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6);
  const pts = history.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" ");
  const [la, lb] = history[history.length - 1];
  return `<svg class="spark ${g.toLowerCase()}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"/><circle cx="${x(la)}" cy="${y(lb)}" r="2.5"/></svg>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// One ranked list as HTML (an <ol>). `showYear` when rows come from different seasons.
export function rankingList(lang: Lang, rows: Row[], g: Gender, { limit = Infinity, showYear = true, showFormat = true, compact = false } = {}) {
  const s = t(lang);
  if (!rows.length) return `<p class="empty muted">${s.no_rows}</p>`;
  const meta = (r: Row) => {
    const bits = [showFormat && r.race.format ? s.format_label[r.race.format] : "", showYear ? String(r.year) : ""].filter(Boolean);
    return bits.length ? `<small class="meta">${bits.join(" · ")}</small>` : "";
  };
  return `<ol class="ranking ${g.toLowerCase()}${compact ? " compact" : ""}">${rows.slice(0, limit).map((r, i) => `
    <li>
      <span class="pos num">${i + 1}</span>
      <a class="name" href="${racePath(lang, r.race.id)}">
        <span class="flag">${flag(r.race.country)}</span>
        <span class="label">${esc(r.race.name)}${compact ? "" : meta(r)}</span>
      </a>
      ${compact ? "" : sparkline(r.history, g)}
      <span class="value num">${fmtNum(lang, r.rci10, 1)}</span>
      ${compact ? "" : `<span class="delta num ${r.delta == null ? "" : r.delta >= 0 ? "up" : "down"}">${r.delta == null ? "" : fmtDelta(lang, r.delta)}</span>`}
    </li>`).join("")}</ol>`;
}
