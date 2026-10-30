// Imports catalog editions into the v2 schema: fetch (cached) → parse → validate → publish.
//
//   pnpm run import ccc                 one race (or an event id: all its races)
//   pnpm run import --all               everything in the catalog
//   pnpm run import ccc --year 2025     one edition
//   pnpm run import --all --dry-run     fetch + validate only, no DB writes, no DATABASE_URL needed
//   --source itra|utmb|legacy           restrict to one source
//   --refresh                           re-download even when cached
//   --force                             re-publish even when the cached payload did not change
//   --prune                             delete DB events/races/editions that left the catalog
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { loadCatalog, allEditions } from "./lib/catalog.mjs";
import { openSession, getUtmbToken, saveSessionCookies } from "./lib/session.mjs";
import { fetchItraResults, parseItraResults, itraIdFromUrl } from "./lib/itra.mjs";
import { fetchUtmbResults, parseUtmbResults } from "./lib/utmb.mjs";
import { readLegacy, parseLegacy } from "./lib/legacy.mjs";
import { validateResults } from "./lib/validate.mjs";
import { assignGenderRanks, computeEditionStats } from "./lib/stats.mjs";
import { relativeToRoot } from "./lib/cache.mjs";
import * as db from "./lib/db.mjs";

const { values: opts, positionals: targets } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: "boolean" }, year: { type: "string" }, source: { type: "string" },
    refresh: { type: "boolean" }, force: { type: "boolean" }, "dry-run": { type: "boolean" }, prune: { type: "boolean" },
  },
});
const dryRun = opts["dry-run"];
const ITRA_DELAY_MS = 6000;   // ITRA shows a captcha when paged faster
const sleep = ms => new Promise(r => setTimeout(r, ms));

const catalog = await loadCatalog();
if (catalog.errors.length) {
  console.error("Catalog errors:\n  " + catalog.errors.join("\n  "));
  process.exit(1);
}
if (!opts.all && !targets.length) {
  console.error("Usage: pnpm run import <race-or-event-id …> | --all  [--year Y] [--source S] [--dry-run] [--refresh] [--force]");
  process.exit(1);
}

let jobs = allEditions(catalog).filter(({ event, race, edition }) =>
  (opts.all || targets.includes(race.id) || targets.includes(event.id)) &&
  (!opts.year || edition.year === Number(opts.year)));
const unknown = targets.filter(t => !catalog.events.some(ev => ev.id === t || ev.races.some(r => r.id === t)));
if (unknown.length) { console.error(`Unknown race/event id: ${unknown.join(", ")}`); process.exit(1); }

// Sources per edition: ITRA and UTMB when present; legacy files only when neither exists.
const tasks = jobs.flatMap(({ race, edition }) => {
  const sources = [];
  if (edition.itra_url) sources.push("itra");
  if (edition.utmb_uri) sources.push("utmb");
  if (!sources.length && edition.legacy.length) sources.push("legacy");
  return sources.filter(s => !opts.source || s === opts.source).map(source => ({ race, edition, source }));
});
console.log(`${tasks.length} result sets to process (${jobs.length} editions)${dryRun ? " — dry run" : ""}\n`);

const sql = dryRun ? null : db.connect();
let browser = null;
const getBrowser = async () => (browser ??= await openSession());
const report = [];

try {
  if (sql) {
    await db.syncCatalog(sql, catalog.events);
    const orphans = await db.findOrphans(sql, catalog.events);
    const nOrphans = orphans.events.length + orphans.races.length + orphans.editions.length + orphans.sets.length;
    if (nOrphans && opts.prune) { await db.deleteOrphans(sql, orphans); console.log(`Pruned ${nOrphans} rows no longer in the catalog`); }
    else if (nOrphans) console.log(`⚠ In DB but not in catalog (use --prune): ${[...orphans.events, ...orphans.races, ...orphans.editions, ...orphans.sets].join(", ")}`);
  }
  const published = sql ? await db.existingResultSets(sql) : new Map();

  for (const { race, edition, source } of tasks) {
    const label = `${edition.id} [${source}]`.padEnd(48);
    try {
      let raw, parsed, context = { expectedYear: edition.year };
      if (source === "itra") {
        raw = await fetchItraResults(edition.itra_url, getBrowser, { refresh: opts.refresh });
        if (!raw.cached) await sleep(ITRA_DELAY_MS);
        parsed = parseItraResults(raw.body);
        context.year = itraIdFromUrl(edition.itra_url).year;
      } else if (source === "utmb") {
        raw = await fetchUtmbResults(edition.utmb_uri, async () => getUtmbToken(await getBrowser()), { refresh: opts.refresh });
        parsed = parseUtmbResults(raw.body);
        context.year = Number(edition.utmb_uri.split(".").pop());
      } else {
        raw = await readLegacy(edition.legacy);
        parsed = parseLegacy(raw.body);
        context.multiFile = edition.legacy.length > 1;
      }

      const sha = createHash("sha256").update(raw.body).digest("hex");
      if (!opts.force && published.get(`${edition.id}|${source}`) === sha) {
        report.push({ label, status: "=", note: "unchanged" });
        console.log(`= ${label} unchanged`);
        continue;
      }

      if (sql) context.previousCounts = await db.previousCounts(sql, race.id, edition.id, source);
      const v = validateResults(parsed, context);
      if (v.errors.length) {
        report.push({ label, status: "✗", note: v.errors.join("; ") });
        console.log(`✗ ${label} ${v.errors.join("; ")}`);
        continue;
      }
      assignGenderRanks(v.results);
      const stats = computeEditionStats(v.results, source);
      if (sql) {
        await db.publishResultSet(sql, {
          editionId: edition.id, source,
          fetchedAt: source === "utmb" ? JSON.parse(raw.body).fetched_at : new Date(),
          rawFile: relativeToRoot(raw.path), rawSha256: sha,
          results: v.results, warnings: v.warnings, stats,
        });
      }
      const f = stats.find(s => s.gender === "F"), m = stats.find(s => s.gender === "M");
      const note = `${v.results.length} finishers · RCI10 M ${m?.rci10 ?? "–"} / F ${f?.rci10 ?? "–"}` +
        (v.warnings.length ? ` · ⚠ ${v.warnings.join("; ")}` : "");
      report.push({ label, status: v.warnings.length ? "⚠" : "✓", note });
      console.log(`${v.warnings.length ? "⚠" : "✓"} ${label} ${note}`);
    } catch (e) {
      const msg = e.message === "ITRA_LOGIN_REQUIRED" || e.message === "UTMB_LOGIN_REQUIRED"
        ? `${e.message.split("_")[0]} session expired (no credentials in .env or auto-login failed) — run: pnpm run login` : e.message;
      report.push({ label, status: "✗", note: msg });
      console.log(`✗ ${label} ${msg}`);
      if (msg.includes("pnpm run login")) break;
    }
  }
} finally {
  if (browser) await saveSessionCookies(browser).catch(() => {});   // keep refreshed session cookies
  await browser?.close();
  await sql?.end();
}

const count = s => report.filter(r => r.status === s).length;
console.log(`\nDone: ${count("✓")} ok, ${count("⚠")} with warnings, ${count("=")} unchanged, ${count("✗")} failed`);
if (count("✗")) process.exitCode = 1;
