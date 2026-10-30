// ITRA discovery: race search + per-year history of one race (its per-race itraId and slug each year).
// Ported from functions/api/discover-races.js and itra-race-info.js, but run in the browser session.
import { cached } from "./cache.mjs";
import { fetchItraResults, itraIdFromUrl } from "./itra.mjs";

const SEARCH_URL = "https://itra.run/Races/FindRaceResults";

// → [{ name, country, distances: [{ km, elevation, url }] }] for events with published results.
export async function searchItra(context, terms, { from = "01-01-2023", to = todayDDMMYYYY() } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('input[name="__RequestVerificationToken"]', { state: "attached", timeout: 60000 });
    // Submit the search form from inside the page so cookies + CSRF token are the browser's own.
    const html = await page.evaluate(async ({ url, terms, from, to }) => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]').value;
      const p = new URLSearchParams({
        __RequestVerificationToken: token, "Input.DateStart": from, "Input.DateEnd": to,
        "Input.Longitude": "0", "Input.Latitude": "0", ZoomLevel: "2", "Input.SearchTerms": terms,
        "Input.NationalLeagues": "false", "Input.NationalLeague": "false",
      });
      const r = await fetch(url, { method: "POST", body: p, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      return r.text();
    }, { url: SEARCH_URL, terms, from, to });
    return parseRaceCards(html);
  } finally {
    await page.close();
  }
}

// Follows one race back through every year of its event. Returns
// { eventName, raceName, years: [{ year, url, name }], unmatched: [year] } — newest first.
export async function raceHistory(context, resultsUrl) {
  const getContext = async () => context;
  const { body: html } = await fetchItraResults(resultsUrl, getContext);
  const info = parseResultsPageInfo(html, resultsUrl);
  const years = [{ year: info.year, url: resultsUrl, name: info.raceName }];
  const unmatched = [];

  for (const ed of info.editions.filter(e => e.year !== info.year)) {
    const { body } = await cached("itra-details", ed.eventItraId, "html", () => fetchPage(context, `https://itra.run/Races/RaceDetails/${ed.eventItraId}`));
    const sibs = parseSiblingButtons(body).filter(s => s.year === ed.year);
    const best = bestMatch(info.raceName, sibs, s => s.name)
      ?? (sibs.length === 1 ? sibs[0] : null);
    if (!best) { unmatched.push(ed.year); continue; }
    years.push({ year: ed.year, url: `https://itra.run/Races/RaceResults/${best.slug}/${ed.year}/${best.itraId}`, name: best.name });
  }
  years.sort((a, b) => b.year - a.year);
  return { eventName: info.eventName, raceName: info.raceName, siblings: info.siblings, years, unmatched };
}

async function fetchPage(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("footer", { state: "attached", timeout: 60000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseResultsPageInfo(html, url) {
  const ids = itraIdFromUrl(url);
  const eventName = decode(html.match(/<h1[^>]*class="[^"]*itra-green[^"]*"[^>]*>\s*([^<]+?)\s*<\/h1>/)?.[1] || "")
    .replace(/\s+\d{4}$/, "");
  const siblings = parseSiblingButtons(html);
  const current = siblings.find(s => s.isCurrent);
  const raceName = current?.name || decode(html.match(/<h3>\s*([^<]+?)\s*<\/h3>/)?.[1] || "");

  // Year dropdown: option values are EVENT-level itraIds (shared by all races of that weekend).
  const editions = [];
  const select = html.match(/<select[^>]+id="select_id"[^>]*>([\s\S]*?)<\/select>/);
  for (const m of (select?.[1] || "").matchAll(/<option value="(\d+)"[^>]*>\s*(\d{4})\s*<\/option>/g)) {
    editions.push({ year: +m[2], eventItraId: +m[1] });
  }
  return { eventName, raceName, year: ids.year, editions, siblings };
}

function parseSiblingButtons(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\s+class="btn btn-outline-dark([^"]*)"[^>]*href="\/Races\/RaceDetails\/([^"]+?)\/(\d{4})\/(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (seen.has(m[4])) continue;
    seen.add(m[4]);
    out.push({
      slug: m[2], year: +m[3], itraId: +m[4], name: decode(m[5].trim()),
      isCurrent: m[1].includes("itra-green"), isCancelled: m[1].includes("line-through"),
    });
  }
  return out.filter(s => !s.isCancelled);
}

function parseRaceCards(html) {
  const start = html.indexOf("var raceSearchJsonSidePopupNew = [");
  if (start === -1) return [];
  const content = html.slice(start);
  const tokens = [];
  for (const m of content.matchAll(/<h4>([^<]+)<\/h4/g)) tokens.push({ type: "name", pos: m.index, value: decode(m[1].trim()) });
  for (const m of content.matchAll(/\/images\/CountryFlags\/([a-z]{2})\.svg/g)) tokens.push({ type: "country", pos: m.index, value: m[1].toUpperCase() });
  for (const m of content.matchAll(/class='boxes'>/g)) {
    const chunk = content.slice(m.index, m.index + 1000);
    const href = chunk.match(/href='(\/Races\/RaceDetails\/[^']+)'/);
    const km = chunk.match(/class='count'>([^<]+)</);
    const elev = chunk.match(/class='distance'>([^<]+)</);
    if (href && km && chunk.includes("green.svg")) {
      tokens.push({
        type: "box", pos: m.index,
        url: "https://itra.run" + href[1].replace("/RaceDetails/", "/RaceResults/"),
        km: parseFloat(km[1]) || null,
        elevation: parseInt((elev?.[1] || "").replace(/[^0-9]/g, ""), 10) || null,
      });
    }
  }
  tokens.sort((a, b) => a.pos - b.pos);
  const events = [];
  let cur = null, country = null;
  for (const t of tokens) {
    if (t.type === "name") { cur = { name: t.value, country, distances: [] }; events.push(cur); }
    else if (t.type === "country") { country = t.value; if (cur && !cur.country) cur.country = country; }
    else if (cur) cur.distances.push({ km: t.km, elevation: t.elevation, url: t.url });
  }
  return events.filter(e => e.distances.length);
}

// ── Name matching across sponsor renames ─────────────────────────────────────

const NOISE = new Set(["hoka", "dacia", "the", "north", "face", "tnf", "by", "utmb", "ultra", "trail", "du", "de", "la",
  "le", "des", "mont", "blanc", "presented", "powered", "salomon", "adidas", "terrex", "race", "km", "k"]);

export function nameTokens(name) {
  return new Set(String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ®™]/g, "")
    .split(/[^a-z0-9]+/).filter(t => t && !NOISE.has(t)));
}

function similarity(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(t => B.has(t)).length;
  return inter / new Set([...A, ...B]).size;
}

function bestMatch(target, items, key) {
  let best = null, score = 0;
  for (const it of items) {
    const s = similarity(target, key(it));
    if (s > score) { best = it; score = s; }
  }
  return score >= 0.5 ? best : null;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

function todayDDMMYYYY() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
