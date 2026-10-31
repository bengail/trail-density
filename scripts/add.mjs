// Adds races to the catalog from ITRA.
//
//   pnpm run add search "lavaredo"                 list matching ITRA events and their distances
//   pnpm run add <itra RaceResults url> --event lavaredo --race lut-120k [--name "LUT 120K"]
//        [--event-name "Lavaredo Ultra Trail"] [--country IT] [--km 120] [--dplus 5800] [--series gtws,...]
//
// The second form follows the race back through every year of its event and writes one edition
// per year into catalog/events/<event>.yaml (existing entries are kept; missing itra URLs are filled in).
// Review the diff, then: pnpm run import <race>.
//
//   pnpm run add refresh [race …] [--import]
//        looks for new editions of races already in the catalog (all of them by default): ITRA from each
//        race's newest ITRA page, UTMB by trying the next years of its newest UTMB race id.
//
//   pnpm run add --batch races.txt [--import]
//        one race per line: <itra url> <event> <race> [name="LUT 120K"] [km=120] … (# comments allowed).
//        Everything runs in one Chrome session (one ITRA login); --import then imports the added races.
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { openSession, saveSessionCookies } from "./lib/session.mjs";
import { searchItra, raceHistory } from "./lib/itra-discover.mjs";
import { CATALOG_DIR, loadCatalog } from "./lib/catalog.mjs";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    event: { type: "string" }, race: { type: "string" }, name: { type: "string" },
    "event-name": { type: "string" }, country: { type: "string" },
    km: { type: "string" }, dplus: { type: "string" }, series: { type: "string" },
    from: { type: "string" }, batch: { type: "string" }, import: { type: "boolean" },
  },
});

const [cmd, ...rest] = positionals;
if (!cmd && !opts.batch) {
  console.error('Usage: pnpm run add search "<terms>"  |  pnpm run add <itra url> --event <id> --race <id>  |  pnpm run add --batch <file> [--import]');
  process.exit(1);
}
const jobs = opts.batch ? await readBatch(opts.batch) : cmd === "refresh" ? await refreshJobs(rest) : cmd === "search" ? [] : [{ url: cmd, ...opts }];

const context = await openSession();
const added = [];
try {
  if (cmd === "search") await search(rest.join(" "));
  for (const job of jobs) {
    if (jobs.length > 1) console.log(`\n######## ${job.event}/${job.race}`);
    try {
      let changed = job.url ? await addRace(job) : 0;
      if (cmd === "refresh") changed += await refreshUtmb(job);
      if (cmd !== "refresh" || changed) added.push(job.race);
    } catch (e) {
      if (e.message === "ITRA_LOGIN_REQUIRED") throw e;
      console.log(`  ✗ ${e.message.split("\n")[0]}`);
    }
  }
} finally {
  await saveSessionCookies(context).catch(() => {});
  await context.close();
}

// Session cookies were just saved, so the import's browser starts already logged in.
if (opts.import && added.length) {
  const r = spawnSync(process.execPath, ["scripts/import.mjs", ...added], { stdio: "inherit" });
  process.exitCode = r.status;
}

async function readBatch(file) {
  const out = [];
  for (const line of (await fs.readFile(file, "utf8")).split("\n")) {
    const parts = line.replace(/#.*/, "").match(/(?:[^\s"]+="[^"]*"|\S)+/g);
    if (!parts) continue;
    const [url, event, race, ...kv] = parts;
    const job = { url, event, race };
    for (const p of kv) { const [k, v] = p.split("="); job[k] = v.replace(/^"|"$/g, ""); }
    out.push(job);
  }
  return out;
}

async function search(terms) {
  const events = await searchItra(context, terms, opts.from ? { from: `01-01-${opts.from}` } : undefined);
  if (!events.length) { console.log("Aucun résultat."); return; }
  for (const ev of events) {
    console.log(`\n${ev.name}  (${ev.country || "?"})`);
    for (const d of ev.distances) console.log(`   ${String(d.km ?? "?").padStart(6)} km  +${d.elevation ?? "?"} m   ${d.url}`);
  }
}

async function addRace(opts) {
  const { url } = opts;
  if (!opts.event || !opts.race) throw new Error("--event and --race are required");
  const history = await raceHistory(context, url);
  console.log(`${history.eventName} — ${history.raceName}`);
  for (const y of history.years) console.log(`  ${y.year}  ${y.name.padEnd(30)} ${y.url}`);
  if (history.unmatched.length) console.log(`  ⚠ pas trouvé pour : ${history.unmatched.join(", ")} (à compléter à la main)`);
  if (history.siblings.length > 1) console.log(`  (autres courses du même événement : ${history.siblings.filter(s => !s.isCurrent).map(s => s.name).join(", ")})`);

  const file = path.join(CATALOG_DIR, `${opts.event}.yaml`);
  let doc;
  try {
    doc = YAML.parseDocument(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    doc = new YAML.Document({ name: opts["event-name"] || history.eventName, ...(opts.country ? { country: opts.country.toUpperCase() } : {}), races: {} });
  }

  const raceKey = ["races", opts.race];
  if (!doc.hasIn(raceKey)) {
    const race = { name: opts.name || history.raceName };
    if (opts.km) race.distance_km = Number(opts.km);
    if (opts.dplus) race.elevation_gain = Number(opts.dplus);
    if (opts.series) race.series = opts.series.split(",");
    race.editions = {};
    doc.setIn(raceKey, doc.createNode(race));
  }

  // An ITRA results id already in the catalog belongs to another race (e.g. two distances sharing one page).
  const catalogText = (await Promise.all((await fs.readdir(CATALOG_DIR)).map(f => fs.readFile(path.join(CATALOG_DIR, f), "utf8")))).join("\n");
  let added = 0, filled = 0, kept = 0;
  for (const y of history.years) {
    const edKey = [...raceKey, "editions", y.year];
    const id = y.url.match(/\/(\d+)$/)?.[1];
    if (!doc.hasIn([...edKey, "itra"]) && id && new RegExp(`/${id}\\b`).test(catalogText)) {
      console.log(`  ${y.year} ignorée : la page ITRA ${id} est déjà utilisée par une autre course`);
      continue;
    }
    if (!doc.hasIn(edKey)) { doc.setIn(edKey, doc.createNode({ itra: y.url })); added++; }
    else if (!doc.getIn([...edKey, "itra"])) { doc.setIn([...edKey, "itra"], y.url); filled++; }
    else kept++;
  }
  // Keep editions newest first.
  const editions = doc.getIn([...raceKey, "editions"]);
  editions.items.sort((a, b) => Number(b.key.value ?? b.key) - Number(a.key.value ?? a.key));

  await fs.writeFile(file, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  console.log(`\n${path.relative(process.cwd(), file)} : ${added} éditions ajoutées, ${filled} complétées, ${kept} inchangées`);

  const { errors } = await loadCatalog();
  if (errors.length) console.log("⚠ Catalogue invalide après ajout :\n  " + errors.join("\n  "));
  else console.log(`Catalogue valide. Prochaine étape : pnpm run import ${opts.race}`);
  return added + filled;
}

// One job per catalog race (or the named ones), starting from its newest ITRA page.
async function refreshJobs(only) {
  const jobs = [];
  for (const f of (await fs.readdir(CATALOG_DIR)).filter(f => f.endsWith(".yaml")).sort()) {
    const ev = YAML.parse(await fs.readFile(path.join(CATALOG_DIR, f), "utf8"));
    for (const [race, r] of Object.entries(ev.races ?? {})) {
      if (only.length && !only.includes(race)) continue;
      const years = Object.keys(r.editions ?? {}).map(Number).sort((a, b) => b - a);
      const newest = years.find(y => r.editions[y]?.itra);
      jobs.push({ url: newest ? r.editions[newest].itra : null, event: f.replace(/\.yaml$/, ""), race });
    }
  }
  return jobs;
}

// api.utmb.world resolves "<race id>.<anything>.<year>", so a race's next editions can be found by
// trying the following years with the id of its newest UTMB uri. Only editions with results are kept.
async function refreshUtmb({ event, race }) {
  const file = path.join(CATALOG_DIR, `${event}.yaml`);
  const doc = YAML.parseDocument(await fs.readFile(file, "utf8"));
  const editions = doc.getIn(["races", race, "editions"])?.toJSON() ?? {};
  const known = Object.entries(editions).filter(([, e]) => e?.utmb).sort((a, b) => b[0] - a[0]);
  if (!known.length) return 0;
  const [lastYear, { utmb }] = known[0];
  const [id, slug] = utmb.split(".");
  let added = 0;
  for (let year = Number(lastYear) + 1; year <= new Date().getFullYear(); year++) {
    const uri = `${id}.${slug}.${year}`;
    const resp = await fetch(`https://api.utmb.world/races/${uri}?lang=en`, {
      headers: { accept: "application/json", origin: "https://utmb.world", referer: "https://utmb.world/", "x-tenant-id": "worldseries" },
    });
    const data = resp.ok ? await resp.json() : null;
    if (!data?.results?.nbHits) continue;
    console.log(`  UTMB ${year}  ${data.name}  (${data.results.nbHits} résultats)  ${uri}`);
    if (doc.hasIn(["races", race, "editions", year])) doc.setIn(["races", race, "editions", year, "utmb"], uri);
    else doc.setIn(["races", race, "editions", year], doc.createNode({ utmb: uri }));
    added++;
  }
  if (added) {
    doc.getIn(["races", race, "editions"]).items.sort((a, b) => Number(b.key.value ?? b.key) - Number(a.key.value ?? a.key));
    await fs.writeFile(file, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  }
  return added;
}
