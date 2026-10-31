// ITRA results pages (itra.run/Races/RaceResults/{slug}/{year}/{id}) — fetched in the browser session.
import { parse } from "node-html-parser";
import { cached } from "./cache.mjs";
import { fetchItraResultsHtml } from "./session.mjs";
import { parseTime } from "./utmb.mjs";
import { toIso2 } from "./countries.mjs";

export function itraIdFromUrl(url) {
  const m = /\/Races\/RaceResults\/[^/]+\/(\d{4})\/(\d+)/.exec(url || "");
  return m ? { year: +m[1], itraId: +m[2] } : null;
}

// getContext is lazy so a fully cached run never opens Chrome.
export async function fetchItraResults(url, getContext, { refresh = false } = {}) {
  const ids = itraIdFromUrl(url);
  if (!ids) throw new Error(`Not an ITRA results URL: ${url}`);
  return cached("itra", ids.itraId, "html", async () => fetchItraResultsHtml(await getContext(), url), { refresh });
}

// → [{ rank, gender, index, runner, nationality, time_s }] (ranked finishers with a Race Score only)
export function parseItraResults(html) {
  const table = parse(html).getElementById("RunnerRaceResults");
  if (!table) throw new Error("ITRA page has no #RunnerRaceResults table");
  const headers = table.querySelectorAll("thead th").map(th => th.text.trim().toLowerCase());
  const col = name => headers.findIndex(h => h.includes(name));
  const cScore = col("score"), cGender = col("gender"), cNat = col("nationality"), cTime = col("time");
  if (cScore < 0 || cGender < 0) throw new Error(`Unexpected ITRA columns: ${headers.join(" | ")}`);

  const out = [];
  for (const tr of table.querySelectorAll("tbody tr")) {
    const td = tr.querySelectorAll("td").map(c => c.text.replace(/\s+/g, " ").trim());
    if (td.length < headers.length) continue;               // paywall rowspan rows are shorter
    const rank = parseInt(td[0], 10);
    const index = parseInt(td[cScore], 10);
    if (!(rank >= 1) || !(index > 0)) continue;
    const g = td[cGender].toUpperCase();
    out.push({
      rank,
      gender: g === "M" || g === "H" ? "M" : g === "F" || g === "W" ? "F" : null,
      index,
      runner: td[1] || null,
      nationality: toIso2(td[cNat]),
      time_s: cTime >= 0 ? parseTime(td[cTime]) : null,
    });
  }
  return out;
}
