// Exports the v2 database to static JSON for the public site (site/public/data/), so visitors never query Supabase.
//
//   pnpm run export
//
//   site/public/data/index.json          every race + a per-edition RCI summary (home, rankings, compare, search)
//   site/public/data/races/<race>.json   one race in full: per edition and gender, RCI levels, density curve,
//                                 index histogram, depth counts and top 10
//
// One source per edition: ITRA, else UTMB, else legacy (the other sources' RCI10 is kept under `others`).
import fs from "node:fs/promises";
import path from "node:path";
import { connect } from "./lib/db.mjs";

const OUT = path.resolve("site/public/data");
const SOURCE_PRIORITY = ["itra", "utmb", "legacy"];
const HIST = { start: 300, step: 20, bins: 33 };          // 300–960; lower scores go to the first bin, higher to the last
const DEPTH_THRESHOLDS = [800, 750, 700, 650];
const MIN_FOR_RCI10 = 10;

const sql = connect();
try {
  const editions = await sql`SELECT * FROM v2.edition_overview ORDER BY race_id, year DESC`;
  const sets = await sql`SELECT id, edition_id, source, n_results, warnings FROM v2.result_sets`;
  const stats = await sql`SELECT * FROM v2.edition_stats`;

  // Pick the preferred result set per edition.
  const chosen = new Map();
  for (const s of sets) {
    const cur = chosen.get(s.edition_id);
    if (!cur || SOURCE_PRIORITY.indexOf(s.source) < SOURCE_PRIORITY.indexOf(cur.source)) chosen.set(s.edition_id, s);
  }
  const chosenIds = [...chosen.values()].map(s => s.id);
  const results = await sql`
    SELECT result_set_id, rank, gender_rank, gender, index, runner, nationality, time_s
    FROM v2.results WHERE result_set_id = ANY(${chosenIds}) ORDER BY result_set_id, gender, gender_rank`;
  for (const r of results) r.index = Number(r.index);         // numeric columns come back as strings
  const resultsBySet = groupBy(results, r => r.result_set_id);
  const statsByKey = new Map(stats.map(s => [`${s.edition_id}|${s.source}|${s.gender}`, s]));

  const races = new Map();
  for (const e of editions) {
    const set = chosen.get(e.edition_id);
    if (!set) continue;
    const race = races.get(e.race_id) ?? races.set(e.race_id, {
      id: e.race_id, name: e.race_name, event: { id: e.event_id, name: e.event_name }, country: e.country?.trim() ?? null,
      discipline: e.discipline, format: e.format, distance_km: num(e.distance_km), elevation_gain: e.elevation_gain,
      series: [], editions: [],
    }).get(e.race_id);
    for (const s of e.series ?? []) if (!race.series.includes(s)) race.series.push(s);

    const field = resultsBySet.get(set.id) ?? [];
    const edition = {
      year: e.year, date: e.date, distance_km: num(e.distance_km), elevation_gain: e.elevation_gain, series: e.series ?? [],
      source: set.source, warnings: set.warnings ?? [], others: {},
    };
    for (const g of ["M", "F"]) {
      const st = statsByKey.get(`${e.edition_id}|${set.source}|${g}`);
      if (st) edition[g] = genderBlock(st, field.filter(r => r.gender === g));
    }
    for (const other of sets.filter(s => s.edition_id === e.edition_id && s.source !== set.source)) {
      edition.others[other.source] = Object.fromEntries(["M", "F"].map(g => [g, rci10(statsByKey.get(`${e.edition_id}|${other.source}|${g}`))]));
    }
    race.editions.push(edition);
  }

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, "races"), { recursive: true });
  let bytes = 0;
  for (const race of races.values()) bytes += await write(`races/${race.id}.json`, race);
  const index = {
    generated_at: new Date().toISOString(),
    races: [...races.values()].map(({ editions, ...race }) => ({
      ...race,
      editions: editions.map(ed => ({
        year: ed.year, source: ed.source,
        M: ed.M ? { n: ed.M.n, rci10: ed.M.rci10 } : null,
        F: ed.F ? { n: ed.F.n, rci10: ed.F.rci10 } : null,
      })),
    })),
  };
  bytes += await write("index.json", index);
  console.log(`${races.size} races, ${editions.length} editions → site/public/data (${Math.round(bytes / 1024)} KB)`);
} finally {
  await sql.end();
}

function genderBlock(st, field) {
  const hist = new Array(HIST.bins).fill(0);
  for (const r of field) hist[Math.min(HIST.bins - 1, Math.max(0, Math.floor((r.index - HIST.start) / HIST.step)))]++;
  const top = field.slice(0, 10);
  return {
    n: st.n_finishers,
    normalization: st.normalization,
    rci3: num(st.rci3), rci5: num(st.rci5), rci10: rci10(st), rci20: num(st.rci20),
    curve: st.top_scores.map(Number),                       // raw index of the top 50, by gender rank
    hist: { ...HIST, counts: hist },
    depth: Object.fromEntries(DEPTH_THRESHOLDS.map(t => [t, field.filter(r => r.index >= t).length])),
    gap_1_10: top.length === 10 ? top[0].index - top[9].index : null,
    top10: top.map(r => ({ rank: r.gender_rank, overall: r.rank, name: r.runner, nat: r.nationality?.trim() ?? null, index: r.index, time_s: r.time_s })),
  };
}

function rci10(st) {
  return st && st.n_finishers >= MIN_FOR_RCI10 ? num(st.rci10) : null;
}

function num(v) {
  return v == null ? null : Number(v);
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))).push(r);
  return m;
}

async function write(rel, data) {
  const body = JSON.stringify(data);
  await fs.writeFile(path.join(OUT, rel), body);
  return body.length;
}
