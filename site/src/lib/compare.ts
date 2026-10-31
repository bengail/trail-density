// Compare page: picks suggestions from index.json and renders the comparison of 1–4 full race files.
// Shared by the build (default selection) and the browser (selection from the URL).
import { t, racePath, flag, fmtNum, fmtDelta, type Lang } from "./i18n";
import { seriesChart } from "./charts";
import type { Edition, Gender, GenderBlock, Race, RaceSummary } from "./types";

export const MAX_COMPARE = 4;
const GENDERS: Gender[] = ["F", "M"];

function latestRci(r: RaceSummary, g: Gender) {
  return r.editions.find(e => e[g]?.rci10 != null)?.[g]?.rci10 ?? null;
}

// Races worth comparing with the selection: same format, shared series, closest RCI10 (men or women).
export function suggest(races: RaceSummary[], selected: string[], limit = 4): RaceSummary[] {
  const base = races.filter(r => selected.includes(r.id));
  if (!base.length) return [];
  const score = (r: RaceSummary) => {
    let s = 0;
    for (const b of base) {
      if (b.format && r.format === b.format) s += 100;
      if (r.series.some(x => b.series.includes(x))) s += 30;
      for (const g of GENDERS) {
        const a = latestRci(r, g), c = latestRci(b, g);
        if (a != null && c != null) s -= Math.abs(a - c) / 2;
      }
    }
    return s / base.length;
  };
  return races
    .filter(r => !selected.includes(r.id) && GENDERS.some(g => latestRci(r, g) != null))
    .map(r => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.r);
}

// Latest edition with an RCI10 for this gender.
function latest(race: Race, g: Gender): { ed: Edition; b: GenderBlock } | null {
  const ed = race.editions.find(e => e[g]?.rci10 != null);
  return ed ? { ed, b: ed[g]! } : null;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

const cls = (i: number) => `c${i + 1}`;

function verdict(lang: Lang, races: Race[], g: Gender) {
  const s = t(lang);
  const rows = races.map(r => ({ r, v: latest(r, g)?.b.rci10 })).filter(x => x.v != null).sort((a, b) => b.v! - a.v!);
  if (rows.length < 2) return "";
  const gap = rows[0].v! - rows[1].v!;
  return `<p class="verdict ${g.toLowerCase()}">${s.verdict(g === "F" ? s.women : s.men, `<strong>${esc(rows[0].r.name)}</strong>`, fmtNum(lang, rows[0].v!, 1), fmtDelta(lang, gap))}</p>`;
}

// One row per race, RCI10 bars for women and men on a shared scale.
function faceOff(lang: Lang, races: Race[]) {
  const s = t(lang);
  const vals = races.flatMap(r => GENDERS.map(g => latest(r, g)?.b.rci10)).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(...vals) - 60) / 50) * 50, hi = Math.max(...vals);
  const best = Object.fromEntries(GENDERS.map(g => [g, Math.max(...races.map(r => latest(r, g)?.b.rci10 ?? -Infinity))]));
  const cell = (r: Race, g: Gender) => {
    const l = latest(r, g);
    if (!l) return `<td class="bar-cell ${g.toLowerCase()}"><span class="muted">${s.no_data}</span></td>`;
    const v = l.b.rci10!;
    const w = Math.max(2, ((v - lo) / (hi - lo || 1)) * 100);
    return `<td class="bar-cell ${g.toLowerCase()}${v === best[g] && races.length > 1 ? " best" : ""}">
      <span class="bar" style="width:${w.toFixed(1)}%"></span>
      <span class="num v">${fmtNum(lang, v, 1)}</span>
      <span class="num yr">${l.ed.year}</span></td>`;
  };
  return `<table class="faceoff">
    <thead><tr><th></th><th class="f">${s.women}</th><th class="m">${s.men}</th></tr></thead>
    <tbody>${races.map((r, i) => `<tr>
      <th scope="row"><a href="${racePath(lang, r.id)}"><span class="swatch ${cls(i)}"></span>${flag(r.country)} ${esc(r.name)}</a>
        <small class="meta">${r.format ? s.format_label[r.format] : ""}</small></th>
      ${cell(r, "F")}${cell(r, "M")}</tr>`).join("")}</tbody></table>`;
}

function legend(races: Race[]) {
  return `<div class="legend">${races.map((r, i) => `<span class="${cls(i)}">${esc(r.name)}</span>`).join("")}</div>`;
}

function historyPair(lang: Lang, races: Race[]) {
  const s = t(lang);
  return GENDERS.map(g => {
    const chart = seriesChart(races.map((r, i) => ({
      label: r.name, cls: cls(i),
      pts: r.editions.filter(e => e[g]?.rci10 != null).map(e => [e.year, e[g]!.rci10!] as [number, number]).reverse(),
    })));
    return `<div class="card"><h3 class="g-title ${g.toLowerCase()}">${g === "F" ? s.women : s.men}</h3>${chart || `<p class="muted">${s.not_enough}</p>`}</div>`;
  }).join("");
}

function densityPair(lang: Lang, races: Race[]) {
  const s = t(lang);
  return GENDERS.map(g => {
    const chart = seriesChart(races.map((r, i) => ({
      label: `${r.name} ${latest(r, g)?.ed.year ?? ""}`, cls: cls(i),
      pts: (latest(r, g)?.b.curve ?? []).map((v, k) => [k + 1, v] as [number, number]),
    })), { yStep: 100, xTicks: [1, 10, 20, 30, 40, 50], dots: false });
    return `<div class="card"><h3 class="g-title ${g.toLowerCase()}">${g === "F" ? s.women : s.men}</h3>${chart || `<p class="muted">${s.not_enough}</p>`}</div>`;
  }).join("");
}

// Metrics × races, women then men; the best value of each row is highlighted.
function details(lang: Lang, races: Race[]) {
  const s = t(lang);
  const metrics: { label: string; get: (b: GenderBlock) => number | null; digits: number; lowerIsBetter?: boolean }[] = [
    { label: "RCI3", get: b => b.rci3, digits: 1 },
    { label: "RCI10", get: b => b.rci10, digits: 1 },
    { label: "RCI20", get: b => b.rci20, digits: 1 },
    { label: s.mean10, get: b => b.top_stats?.[10]?.mean ?? null, digits: 1 },
    { label: s.median10, get: b => b.top_stats?.[10]?.median ?? null, digits: 1 },
    ...["750", "700", "650"].map(th => ({ label: s.above(th), get: (b: GenderBlock) => b.depth[th] ?? null, digits: 0 })),
    { label: s.gap, get: b => b.gap_1_10, digits: 1, lowerIsBetter: true },
    { label: s.n_index, get: b => b.n, digits: 0 },
  ];
  const head = `<tr><th></th>${races.map((r, i) => `<th class="num"><span class="swatch ${cls(i)}"></span>${esc(r.name)}</th>`).join("")}</tr>`;
  const body = GENDERS.map(g => {
    const blocks = races.map(r => latest(r, g));
    const years = `<tr class="group ${g.toLowerCase()}"><th>${g === "F" ? s.women : s.men}</th>${blocks.map(l => `<td class="num muted">${l?.ed.year ?? ""}</td>`).join("")}</tr>`;
    return years + metrics.map(m => {
      const vals = blocks.map(l => (l ? m.get(l.b) : null));
      const present = vals.filter((v): v is number => v != null);
      const top = present.length > 1 ? (m.lowerIsBetter ? Math.min(...present) : Math.max(...present)) : null;
      return `<tr><th scope="row">${m.label}</th>${vals.map(v => `<td class="num${v != null && v === top ? ` best ${g.toLowerCase()}` : ""}">${v == null ? s.no_data : fmtNum(lang, v, m.digits)}</td>`).join("")}</tr>`;
    }).join("");
  }).join("");
  return `<div class="table-scroll"><table class="details"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

export function compareView(lang: Lang, races: Race[]) {
  const s = t(lang);
  if (!races.length) return `<p class="empty muted">${s.compare_pick}</p>`;
  return `
    <section class="verdicts">${GENDERS.map(g => verdict(lang, races, g)).join("")}</section>
    <section class="card">
      <div class="card-head"><div><h2>${s.face_off}</h2><p class="sub muted">${s.face_off_sub}</p></div></div>
      ${faceOff(lang, races)}
    </section>
    <section>
      <div class="section-head"><div><h2>${s.history}</h2><p class="muted">${s.history_sub}</p></div>${legend(races)}</div>
      <div class="pair">${historyPair(lang, races)}</div>
    </section>
    <section>
      <div class="section-head"><div><h2>${s.density}</h2><p class="muted">${s.density_sub}</p></div>${legend(races)}</div>
      <div class="pair">${densityPair(lang, races)}</div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>${s.details}</h2><p class="sub muted">${s.details_sub}</p></div></div>
      ${details(lang, races)}
    </section>`;
}
