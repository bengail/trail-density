// "Et moi ?": the place a score would have earned at each race, shared by the build and the browser.
// A finisher's score comes from their time and follows the finish order, so counting who scored higher gives the place.
import { t, racePath, flag, fmtNum, ordinal, SOURCES, type Lang } from "./i18n";
import { STALE_AFTER, esc } from "./rankings";
import type { Format, Gender, PlacementRace, Scale } from "./types";

export const SAMPLE_SCORE = 650;           // what the page opens on, so it never starts empty
const NEAR_TOP10 = 50;                     // the gap to the top 10 is only worth showing within this many points

export interface Placing {
  race: PlacementRace;
  year: number;
  place: number;
  n: number;
  share: number;                           // place / field size, capped at 1
  toTop10: number;                         // points missing to enter the top 10, 0 once in
  scores: number[];                        // best first
}

// How hard a race is to place well in: the score of the 10th (fields are at least 10 strong).
const hardness = (p: Placing) => p.scores[9];

function decode(deltas: number[]) {
  const scores = new Array<number>(deltas.length);
  deltas.forEach((d, i) => (scores[i] = i ? scores[i - 1] - d : d));
  return scores;
}

const newestYear = (races: PlacementRace[]) =>
  Math.max(...races.flatMap(r => Object.values(r.scales).map(b => b.year)));

export function placings(races: PlacementRace[], score: number, scale: Scale, g: Gender, format: Format | "all" = "all") {
  const oldest = newestYear(races) - STALE_AFTER;
  const pool = races.filter(r => format === "all" || r.format === format);
  const rows: Placing[] = [];
  for (const race of pool) {
    const block = race.scales[scale];
    if (!block?.[g] || block.year < oldest) continue;
    const scores = decode(block[g]!);
    const place = scores.filter(v => v > score).length + 1;
    rows.push({
      race, year: block.year, place, n: scores.length, scores,
      share: Math.min(1, place / scores.length),
      toTop10: Math.max(0, scores[9] - score),
    });
  }
  rows.sort((a, b) => hardness(b) - hardness(a));
  return { rows, missing: pool.length - rows.length };
}

// The field as a small histogram (best scores on the right), with everyone you would have beaten filled in.
function fieldStrip(p: Placing, score: number, g: Gender, w = 84, h = 24) {
  const BINS = 21;
  const lo = p.scores[p.scores.length - 1], hi = p.scores[0];
  const counts = new Array<number>(BINS).fill(0);
  const bin = (v: number) => Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo || 1)) * BINS));
  for (const v of p.scores) counts[bin(v)]++;
  const max = Math.max(...counts), bw = w / BINS;
  const bars = counts.map((c, i) => {
    const bh = c ? Math.max(1.5, (c / max) * (h - 2)) : 0;
    const beaten = lo + ((i + 1) / BINS) * (hi - lo) <= score;
    return `<rect class="${beaten ? "beaten" : ""}" x="${(i * bw + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}"/>`;
  }).join("");
  const x = Math.max(0.5, Math.min(w - 0.5, ((score - lo) / (hi - lo || 1)) * w));
  return `<svg class="strip ${g.toLowerCase()}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${h}"/></svg>`;
}

function placeLabel(lang: Lang, place: number, g: Gender) {
  return lang === "fr" && place === 1 && g === "M" ? "1er" : ordinal(lang, place);
}

export function summary(lang: Lang, rows: Placing[]) {
  const count = (test: (p: Placing) => boolean) => rows.filter(test).length;
  return t(lang).me_summary(rows.length, count(p => p.place <= 3), count(p => p.place <= 10), count(p => p.share <= 0.5));
}

// One gender's list as HTML: its one-line summary, then every race, hardest first.
export function placementList(lang: Lang, races: PlacementRace[], score: number, scale: Scale, g: Gender, format: Format | "all" = "all") {
  const s = t(lang);
  const { rows } = placings(races, score, scale, g, format);
  if (!rows.length) return `<p class="empty muted">${s.no_rows}</p>`;
  return `<p class="verdict ${g.toLowerCase()}">${summary(lang, rows)}</p>
  <ol class="placing ${g.toLowerCase()}">${rows.map(p => {
    const meta = [p.race.format ? s.format_label[p.race.format] : "", String(p.year), p.toTop10 > 0 && p.toTop10 <= NEAR_TOP10 ? s.me_gap(p.toTop10) : ""].filter(Boolean);
    return `
    <li>
      <a class="name" href="${racePath(lang, p.race.id)}">
        <span class="flag">${flag(p.race.country)}</span>
        <span class="label">${esc(p.race.name)}<small class="meta">${meta.join(" · ")}</small></span>
      </a>
      ${fieldStrip(p, score, g)}
      <span class="value num">${placeLabel(lang, p.place, g)}<small>${s.me_of} ${fmtNum(lang, Math.max(p.n, p.place))}</small></span>
      <span class="top num">${s.me_top(Math.max(1, Math.ceil(p.share * 100)))}</span>
    </li>`;
  }).join("")}</ol>`;
}

export function missingNote(lang: Lang, races: PlacementRace[], score: number, scale: Scale, g: Gender, format: Format | "all" = "all") {
  const { missing } = placings(races, score, scale, g, format);
  return missing ? t(lang).me_missing(missing, SOURCES[scale]) : "";
}
