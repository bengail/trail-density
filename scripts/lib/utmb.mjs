// UTMB World API (api.utmb.world). Results need the short-lived access_token from the browser session.
import { cached } from "./cache.mjs";
import { toIso2 } from "./countries.mjs";

const API = "https://api.utmb.world";
const PAGE = 50;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, params, token) {
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 1; ; attempt++) {
    const resp = await fetch(`${API}/${path}?${qs}`, {
      headers: {
        accept: "application/json",
        origin: "https://utmb.world",
        referer: "https://utmb.world/",
        "x-tenant-id": "worldseries",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (resp.ok) return resp.json();
    // The API answers 503 when paged too fast — back off and retry.
    if (resp.status === 503 && attempt < 5) { await sleep(2000 * attempt); continue; }
    throw new Error(`api.utmb.world ${path} → HTTP ${resp.status}`);
  }
}

// Fetches the whole ranking of one race (all pages, both genders, DNFs included). Cached as one payload.
export async function fetchUtmbResults(uri, getToken, { refresh = false } = {}) {
  return cached("utmb", uri, "json", async () => {
    const token = await getToken();
    if (!token) throw new Error("UTMB_LOGIN_REQUIRED");
    const rows = [];
    let total = Infinity;
    for (let offset = 0; offset < total; offset += PAGE) {
      const data = await api(`races/${uri}/results`, { lang: "en", limit: PAGE, offset }, token);
      if (!data.isLogged) throw new Error("UTMB_LOGIN_REQUIRED");
      total = data.nbHits ?? 0;
      rows.push(...(data.results || []));
      if (!data.results?.length) break;
      await sleep(400);
    }
    return JSON.stringify({ uri, fetched_at: new Date().toISOString(), nbHits: total, results: rows });
  }, { refresh });
}

// → [{ rank, gender, index, runner, nationality, time_s }] (finishers with an index only)
export function parseUtmbResults(body) {
  const data = JSON.parse(body);
  return data.results
    .filter(r => Number.isFinite(r.rank) && r.rank >= 1 && r.index > 0)
    .map(r => ({
      rank: r.rank,
      gender: r.gender === "H" ? "M" : r.gender === "F" ? "F" : null,
      index: r.index,
      runner: r.fullname || null,
      nationality: toIso2(r.nationalityCode),
      time_s: parseTime(r.time),
    }));
}

export function parseTime(t) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(t || "").trim());
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
}

