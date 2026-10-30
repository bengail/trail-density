// Build-time access to the JSON exported by `pnpm run export` (site/public/data).
// The same files are served to the browser under /data/.
import fs from "node:fs";
import path from "node:path";
import type { Index, Race, RaceSummary } from "./types";

const DATA_DIR = path.resolve("public/data");

let index: Index | null = null;
export function loadIndex(): Index {
  return (index ??= JSON.parse(fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf8")));
}

export function loadRace(id: string): Race {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "races", `${id}.json`), "utf8"));
}

// Latest edition with an RCI10 for this gender.
export function latestRci(race: RaceSummary, g: "M" | "F") {
  return race.editions.find(e => e[g]?.rci10 != null) ?? null;
}

// Rank of a race among races of the same format, each taken at its latest edition with an RCI10.
export function formatRank(race: RaceSummary, g: "M" | "F") {
  if (!race.format) return null;
  const own = latestRci(race, g);
  if (!own) return null;
  const peers = loadIndex().races
    .filter(r => r.format === race.format)
    .map(r => latestRci(r, g)?.[g]?.rci10)
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a);
  return { rank: peers.indexOf(own[g]!.rci10!) + 1, of: peers.length };
}
