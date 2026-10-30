// Loads catalog/events/*.yaml — the source of truth for what gets imported.
//
//   name: UTMB Mont-Blanc        # event
//   country: FR                  # ISO alpha-2
//   races:
//     ccc:                       # race id, stable across sponsor renames
//       name: CCC
//       discipline: trail        # trail | uphill | skyrace (default trail)
//       distance_km: 100
//       elevation_gain: 6156
//       series: [utmb-world-series]
//       editions:
//         2025:
//           itra: https://itra.run/Races/RaceResults/…/2025/107989
//           utmb: 141.hokautmbmont-blancccc.2025
//           legacy: [data/courses/CCC2025.json]   # old hand-made files, used when no other source
//           distance_km / elevation_gain / series / date   # per-edition overrides
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { itraIdFromUrl } from "./itra.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CATALOG_DIR = path.join(ROOT, "catalog/events");

const ID = /^[a-z0-9-]+$/;
const EVENT_KEYS = new Set(["name", "country", "website", "races"]);
const RACE_KEYS = new Set(["name", "discipline", "distance_km", "elevation_gain", "series", "editions"]);
const EDITION_KEYS = new Set(["itra", "utmb", "legacy", "distance_km", "elevation_gain", "series", "date"]);

// → { events: [{ id, name, country, website, races: [{ id, …, editions: [{ id, year, … }] }] }], errors: [] }
export async function loadCatalog() {
  const files = (await fs.readdir(CATALOG_DIR)).filter(f => f.endsWith(".yaml")).sort();
  const events = [];
  const errors = [];
  const seenRaces = new Map();
  const seenItra = new Map();
  const seenUtmb = new Map();

  for (const file of files) {
    const eventId = file.replace(/\.yaml$/, "");
    const where = `catalog/events/${file}`;
    let doc;
    try {
      doc = YAML.parse(await fs.readFile(path.join(CATALOG_DIR, file), "utf8"));
    } catch (e) {
      errors.push(`${where}: invalid YAML — ${e.message}`);
      continue;
    }
    const err = msg => errors.push(`${where}: ${msg}`);
    if (!ID.test(eventId)) err(`file name must be a lowercase id`);
    for (const k of Object.keys(doc || {})) if (!EVENT_KEYS.has(k)) err(`unknown key "${k}"`);
    if (!doc?.name) err(`missing name`);
    if (doc?.country && !/^[A-Z]{2}$/.test(doc.country)) err(`country must be ISO alpha-2, got "${doc.country}"`);

    const event = { id: eventId, name: doc?.name, country: doc?.country || null, website: doc?.website || null, races: [] };
    for (const [raceId, r] of Object.entries(doc?.races || {})) {
      const rerr = msg => err(`${raceId}: ${msg}`);
      if (!ID.test(raceId)) rerr(`race id must match ${ID}`);
      if (seenRaces.has(raceId)) rerr(`race id already used in ${seenRaces.get(raceId)}`);
      seenRaces.set(raceId, where);
      for (const k of Object.keys(r || {})) if (!RACE_KEYS.has(k)) rerr(`unknown key "${k}"`);
      if (!r?.name) rerr(`missing name`);
      if (r?.discipline && !["trail", "uphill", "skyrace"].includes(r.discipline)) rerr(`bad discipline "${r.discipline}"`);

      const race = {
        id: raceId, event_id: eventId, name: r?.name, discipline: r?.discipline || "trail",
        distance_km: r?.distance_km ?? null, elevation_gain: r?.elevation_gain ?? null, series: r?.series || [],
        editions: [],
      };
      for (const [yearKey, e] of Object.entries(r?.editions || {})) {
        const year = Number(yearKey);
        const eerr = msg => rerr(`${year}: ${msg}`);
        if (!Number.isInteger(year)) { eerr(`edition key must be a year`); continue; }
        for (const k of Object.keys(e || {})) if (!EDITION_KEYS.has(k)) eerr(`unknown key "${k}"`);

        const itra = e?.itra ? itraIdFromUrl(e.itra) : null;
        if (e?.itra && !itra) eerr(`itra must be a RaceResults URL`);
        if (itra && itra.year !== year) eerr(`itra URL is for ${itra.year}`);
        if (itra && seenItra.has(itra.itraId)) eerr(`itra id ${itra.itraId} already used by ${seenItra.get(itra.itraId)}`);
        if (itra) seenItra.set(itra.itraId, `${raceId}-${year}`);
        if (e?.utmb && !String(e.utmb).endsWith(`.${year}`)) eerr(`utmb uri must end with .${year}`);
        if (e?.utmb && seenUtmb.has(e.utmb)) eerr(`utmb uri already used by ${seenUtmb.get(e.utmb)}`);
        if (e?.utmb) seenUtmb.set(e.utmb, `${raceId}-${year}`);
        const legacy = e?.legacy ? [].concat(e.legacy) : [];
        if (!e?.itra && !e?.utmb && !legacy.length) eerr(`no source (itra, utmb or legacy)`);

        race.editions.push({
          id: `${raceId}-${year}`, race_id: raceId, year,
          date: e?.date || null,
          distance_km: e?.distance_km ?? null, elevation_gain: e?.elevation_gain ?? null,
          series: e?.series || [],
          itra_url: e?.itra || null, itra_id: itra?.itraId ?? null,
          utmb_uri: e?.utmb || null,
          legacy,
        });
      }
      race.editions.sort((a, b) => b.year - a.year);
      event.races.push(race);
    }
    events.push(event);
  }
  return { events, errors };
}

export function allEditions(catalog) {
  return catalog.events.flatMap(ev => ev.races.flatMap(r => r.editions.map(e => ({ event: ev, race: r, edition: e }))));
}
