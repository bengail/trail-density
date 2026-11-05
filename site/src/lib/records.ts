// Records from index.json, shared by the build and the browser (format filter).
import { t, racePath, flag, fmtNum, fmtDelta, type Lang } from "./i18n";
import { esc } from "./rankings";
import type { EditionSummary, Format, Gender, RaceSummary } from "./types";

const TOP = 10;                      // rows in the all-time and biggest-rise lists
const MIN_HISTORY = 5;               // a record only counts as "broken" with at least this many editions behind it
const MIN_FIELD = 30;                // as on the home page: small fields swing too much to call a rise
const MAX_GAP = 2;                   // no rise measured across more than this many seasons

interface Item {
  race: RaceSummary;
  value: string;
  meta: string;
  note?: string;
}

type Scored = { year: number; source: string; b: EditionSummary & { rci10: number } };

// A race's editions with an RCI10 for this gender, newest first.
function scored(race: RaceSummary, g: Gender): Scored[] {
  return race.editions.flatMap(e => {
    const b = e[g];
    return b?.rci10 != null ? [{ year: e.year, source: e.source, b: b as Scored["b"] }] : [];
  });
}

// ITRA and legacy archives share a scale, UTMB does not.
const sameScale = (a: Scored, b: Scored) => (a.source === "utmb") === (b.source === "utmb");

function allTime(lang: Lang, races: RaceSummary[], g: Gender): Item[] {
  return races
    .flatMap(race => scored(race, g).map(ed => ({ race, ed })))
    .sort((a, b) => b.ed.b.rci10 - a.ed.b.rci10)
    .slice(0, TOP)
    .map(({ race, ed }) => ({ race, value: fmtNum(lang, ed.b.rci10, 1), meta: metaOf(lang, race, ed.year) }));
}

// Races whose newest edition, in the newest season, beat every earlier one.
function broken(lang: Lang, races: RaceSummary[], g: Gender, season: number): Item[] {
  const s = t(lang);
  return races.flatMap(race => {
    const [last, ...before] = scored(race, g);
    if (!last || last.year !== season || before.length + 1 < MIN_HISTORY) return [];
    const prev = before.reduce((a, b) => (b.b.rci10 > a.b.rci10 ? b : a));
    const margin = last.b.rci10 - prev.b.rci10;
    if (margin <= 0) return [];
    return [{ margin, item: {
      race, value: fmtNum(lang, last.b.rci10, 1), note: fmtDelta(lang, margin),
      meta: s.records_prev(fmtNum(lang, prev.b.rci10, 1), prev.year),
    } }];
  }).sort((a, b) => b.margin - a.margin).map(x => x.item);
}

function rises(lang: Lang, races: RaceSummary[], g: Gender): Item[] {
  return races.flatMap(race => {
    const eds = scored(race, g);
    return eds.slice(0, -1).flatMap((ed, i) => {
      const prev = eds[i + 1];
      if (ed.year - prev.year > MAX_GAP || !sameScale(ed, prev) || ed.b.n < MIN_FIELD || prev.b.n < MIN_FIELD) return [];
      return [{ race, ed, prev, rise: ed.b.rci10 - prev.b.rci10 }];
    });
  }).sort((a, b) => b.rise - a.rise).slice(0, TOP).map(({ race, ed, prev, rise }) => ({
    race, value: fmtDelta(lang, rise),
    meta: `${prev.year} → ${ed.year} · ${fmtNum(lang, prev.b.rci10)} → ${fmtNum(lang, ed.b.rci10)}`,
  }));
}

function perRace(lang: Lang, races: RaceSummary[], g: Gender): Item[] {
  return races.flatMap(race => {
    const eds = scored(race, g);
    if (eds.length < 2) return [];
    const best = eds.reduce((a, b) => (b.b.rci10 > a.b.rci10 ? b : a));
    const gap = eds[0].b.rci10 - best.b.rci10;
    return [{ rci: best.b.rci10, item: {
      race, value: fmtNum(lang, best.b.rci10, 1), meta: metaOf(lang, race, best.year),
      note: eds[0] === best ? "" : fmtDelta(lang, gap),
    } }];
  }).sort((a, b) => b.rci - a.rci).map(x => x.item);
}

function metaOf(lang: Lang, race: RaceSummary, year: number) {
  const label = race.format ? t(lang).format_label[race.format] : "";
  return [label, year].filter(Boolean).join(" · ");
}

function list(lang: Lang, items: Item[], g: Gender) {
  if (!items.length) return `<p class="empty muted">${t(lang).no_rows}</p>`;
  const notes = items.some(it => it.note);
  return `<ol class="ranking record ${g.toLowerCase()}${notes ? " notes" : ""}">${items.map((it, i) => `
    <li>
      <span class="pos num">${i + 1}</span>
      <a class="name" href="${racePath(lang, it.race.id)}">
        <span class="flag">${flag(it.race.country)}</span>
        <span class="label">${esc(it.race.name)}<small class="meta">${esc(it.meta)}</small></span>
      </a>
      <span class="value num">${it.value}</span>
      ${notes ? `<span class="delta num">${it.note ?? ""}</span>` : ""}
    </li>`).join("")}</ol>`;
}

function section(lang: Lang, title: string, sub: string, lists: Record<Gender, Item[]>) {
  const s = t(lang);
  if (!lists.F.length && !lists.M.length) return "";
  return `<section>
    <div class="section-head"><div><h2>${title}</h2><p class="muted">${sub}</p></div></div>
    <div class="pair">
      <div class="card"><h3 class="g-title f">${s.women}</h3>${list(lang, lists.F, "F")}</div>
      <div class="card"><h3 class="g-title m">${s.men}</h3>${list(lang, lists.M, "M")}</div>
    </div>
  </section>`;
}

const both = (fn: (g: Gender) => Item[]) => ({ F: fn("F"), M: fn("M") });

export function recordsView(lang: Lang, all: RaceSummary[], format: Format | "all" = "all") {
  const s = t(lang);
  const races = all.filter(r => format === "all" || r.format === format);
  const season = Math.max(...all.flatMap(r => r.editions.map(e => e.year)));
  return [
    section(lang, s.records_alltime, s.records_alltime_sub, both(g => allTime(lang, races, g))),
    section(lang, s.records_broken(season), s.records_broken_sub(MIN_HISTORY), both(g => broken(lang, races, g, season))),
    section(lang, s.records_rises, s.records_rises_sub, both(g => rises(lang, races, g))),
    section(lang, s.records_each, s.records_each_sub, both(g => perRace(lang, races, g))),
  ].join("");
}
