// Hand-made JSON files from data/courses/ (pre-Supabase era). Read-only fallback source.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toIso2, countryNameToIso2 } from "./countries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Several files for one edition (e.g. separate women / men rankings) are concatenated.
export async function readLegacy(files) {
  const bodies = await Promise.all(files.map(f => fs.readFile(path.join(ROOT, f), "utf8")));
  return { body: JSON.stringify(bodies.map(b => JSON.parse(b))), path: path.join(ROOT, files[0]), cached: true };
}

export function parseLegacy(body) {
  return JSON.parse(body).flatMap(doc => (doc.results || [])
    .filter(r => Number(r.rank) >= 1 && Number(r.index) > 0)
    .map(r => ({
      rank: Number(r.rank),
      gender: legacyGender(r.gender),
      index: Number(r.index),
      runner: r.runner || null,
      nationality: toIso2(r.nationality) || countryNameToIso2(r.nationality),
      time_s: null,
    })));
}

function legacyGender(g) {
  const v = String(g || "").trim().toLowerCase();
  if (["m", "h", "men", "male", "homme", "hommes"].includes(v)) return "M";
  if (["f", "w", "women", "female", "femme", "femmes"].includes(v)) return "F";
  return null;
}
