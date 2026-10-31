// Trail Density MCP server: read-only questions about trail race field strength (RCI).
// Stateless Worker; all data comes from the public JSON the site publishes (/data/index.json, /data/races/<id>.json).
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env { DATA_URL: string; SITE_URL: string }

type Gender = "F" | "M";
type Format = "vertical" | "short" | "medium" | "long" | "ultra";
interface Summary { n: number; rci3: number | null; rci10: number | null; rci20: number | null; mean10: number | null; median10: number | null }
interface RaceSummary {
  id: string; name: string; event: { id: string; name: string }; country: string | null; format: Format | null;
  distance_km: number | null; elevation_gain: number | null; series: string[];
  editions: { year: number; source: string; M: Summary | null; F: Summary | null }[];   // newest first
}

const METRICS = ["rci10", "rci3", "rci20", "mean10", "median10"] as const;
type Metric = typeof METRICS[number];
// Same rules as the site's rankings (site/src/lib/rankings.ts).
const STALE_AFTER = 2, MAX_DELTA_GAP = 2, MIN_FOR_RCI10 = 10;

const INSTRUCTIONS = `Trail Density measures how strong the front of trail and ultra races is, from finisher scores (ITRA Race Score, UTMB Index).
Main metric: RCI10 (Realized Competition Index, by Travis Loncar / Freetrail) = mean of the top 10 scores minus their population standard deviation, per gender.
Higher = stronger and more even top 10. Roughly: 900+ is world-class, 850+ elite international, 750–850 strong, below 700 a regional field.
Women's scores are converted to the men's scale (Enduraw formulas) so women's and men's RCI can be compared.
Formats: vertical, short (<30 km), medium (30–60 km), long (60–120 km), ultra (>=120 km).
The database covers a curated set of elite races (Golden Trail Series, UTMB World Series, WMRA, major US/European races), not every race.
Use "rankings" for "which race is the most competitive" questions, "find_races" to resolve a race name to an id, "race" for one race's history or an edition's top 10, "compare" for 2–4 races.
Always cite the edition year and gender, and link to the race page (url field) when useful. A difference of a few points is not meaningful.`;

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

async function getJson<T>(env: Env, rel: string): Promise<T> {
  const res = await fetch(`${env.DATA_URL}/${rel}`, { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`Data not available (${res.status}) for ${rel}`);
  return res.json() as Promise<T>;
}
const loadIndex = (env: Env) => getJson<{ generated_at: string; races: RaceSummary[] }>(env, "index.json").then(d => d.races);

const raceUrl = (env: Env, id: string) => `${env.SITE_URL}/en/race/${id}/`;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function brief(env: Env, r: RaceSummary) {
  const latest = (g: Gender) => {
    const e = r.editions.find(e => e[g]?.rci10 != null);
    return e ? { year: e.year, rci10: e[g]!.rci10 } : null;
  };
  return {
    id: r.id, name: r.name, event: r.event.name, country: r.country, format: r.format,
    distance_km: r.distance_km, elevation_gain: r.elevation_gain, series: r.series,
    editions: r.editions.map(e => e.year), latest: { F: latest("F"), M: latest("M") }, url: raceUrl(env, r.id),
  };
}

function rank(env: Env, races: RaceSummary[], g: Gender, metric: Metric, season: "latest" | number, format?: Format) {
  const newest = Math.max(...races.flatMap(r => r.editions.map(e => e.year)));
  const rows = [];
  for (const race of races) {
    if (format && race.format !== format) continue;
    const eds = race.editions.filter(e => e[g]?.[metric] != null && (e[g]?.n ?? 0) >= MIN_FOR_RCI10);
    const i = season === "latest" ? 0 : eds.findIndex(e => e.year === season);
    const ed = eds[i];
    if (!ed || (season === "latest" && ed.year < newest - STALE_AFTER)) continue;
    const prev = eds[i + 1];
    const value = ed[g]![metric]!;
    rows.push({
      race: race.name, id: race.id, format: race.format, country: race.country, year: ed.year, [metric]: value, finishers: ed[g]!.n,
      change_vs_previous: prev && ed.year - prev.year <= MAX_DELTA_GAP ? Math.round((value - prev[g]![metric]!) * 10) / 10 : null,
      previous_year: prev?.year ?? null, url: raceUrl(env, race.id),
    });
  }
  return rows.sort((a, b) => (b[metric] as number) - (a[metric] as number)).map((r, k) => ({ rank: k + 1, ...r }));
}

// Per-gender view of one edition from a full race file, without the bulky chart arrays.
function editionDetail(ed: any, withTop10: boolean) {
  const block = (b: any) => b && {
    finishers_with_score: b.n, rci3: b.rci3, rci5: b.rci5, rci10: b.rci10, rci20: b.rci20,
    top10: b.top_stats?.[10], top20: b.top_stats?.[20], depth_finishers_above: b.depth, gap_1st_10th: b.gap_1_10,
    ...(withTop10 ? { top10_results: b.top10.map((r: any) => ({ rank: r.rank, name: r.name, nationality: r.nat, score: r.index, time_s: r.time_s })) } : {}),
  };
  const other = Object.entries(ed.sources ?? {}).filter(([src]) => src !== ed.source)
    .map(([src, s]: [string, any]) => ({ source: src, F_rci10: s.F?.rci10 ?? null, M_rci10: s.M?.rci10 ?? null }));
  return { year: ed.year, date: ed.date, distance_km: ed.distance_km, elevation_gain: ed.elevation_gain, source: ed.source, F: block(ed.F), M: block(ed.M), other_sources: other };
}

function resolve(races: RaceSummary[], ref: string) {
  const exact = races.find(r => r.id === ref);
  if (exact) return exact;
  const q = fold(ref);
  const hits = races.filter(r => fold(`${r.name} ${r.event.name} ${r.id}`).includes(q));
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `"${ref}" is ambiguous: ${hits.map(r => r.id).join(", ")}` : `No race matches "${ref}". Use find_races.`);
}

function createServer(env: Env) {
  const server = new McpServer({ name: "trail-density", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const gender = z.enum(["F", "M"]).describe("F = women, M = men");
  const format = z.enum(["vertical", "short", "medium", "long", "ultra"]);

  server.registerTool("find_races", {
    description: "Search the races in the database by name, country, format or series. Returns ids, metadata and the latest RCI10 per gender. Call with no arguments to list every race.",
    inputSchema: z.object({
      query: z.string().optional().describe("Part of the race or event name, accents ignored, e.g. 'zinal', 'templiers'"),
      country: z.string().length(2).optional().describe("ISO 3166 alpha-2 code, e.g. FR, US, CH"),
      format: format.optional(),
      series: z.string().optional().describe("e.g. gtws, utmb-world-series, wmra-world-cup"),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, country, format, series }) => {
    const races = (await loadIndex(env)).filter(r =>
      (!query || fold(`${r.name} ${r.event.name} ${r.id}`).includes(fold(query))) &&
      (!country || r.country === country.toUpperCase()) && (!format || r.format === format) && (!series || r.series.includes(series)));
    return text({ count: races.length, races: races.map(r => brief(env, r)) });
  });

  server.registerTool("rankings", {
    description: "Rank races by field strength for one gender: each race at its latest edition (default) or in a given season. Answers 'which race is the most competitive', optionally within a format.",
    inputSchema: z.object({
      gender,
      format: format.optional().describe("Restrict to one format; omit for all"),
      season: z.union([z.literal("latest"), z.number().int()]).default("latest").describe("'latest' = each race's latest edition (races not held in the last 2 seasons are left out), or a year"),
      metric: z.enum(METRICS).default("rci10").describe("rci10 (reference), rci3 (podium), rci20 (depth), mean10, median10"),
      limit: z.number().int().min(1).max(60).default(15),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ gender, format, season, metric, limit }) => {
    const rows = rank(env, await loadIndex(env), gender, metric, season, format);
    return text({ gender, format: format ?? "all", season, metric, total: rows.length, rows: rows.slice(0, limit) });
  });

  server.registerTool("race", {
    description: "One race: metadata and RCI history per edition and gender. With a year, the full detail of that edition (RCI3/5/10/20, top 10/20 mean and median, depth, gap 1st–10th, top 10 results with names and times, other source).",
    inputSchema: z.object({
      race: z.string().describe("Race id (from find_races) or a distinctive part of its name"),
      year: z.number().int().optional().describe("Edition year for the full detail; omit for the history"),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ race: ref, year }) => {
    const summary = resolve(await loadIndex(env), ref);
    const base = brief(env, summary);
    if (year == null) return text({ ...base, history: summary.editions });
    const full = await getJson<any>(env, `races/${summary.id}.json`);
    const ed = full.editions.find((e: any) => e.year === year);
    if (!ed) throw new Error(`${summary.name} has no ${year} edition. Editions: ${base.editions.join(", ")}`);
    return text({ ...base, edition: editionDetail(ed, true) });
  });

  server.registerTool("compare", {
    description: "Compare 2 to 4 races side by side at their latest edition (or a given year): all metrics per gender, plus each race's RCI10 history.",
    inputSchema: z.object({
      races: z.array(z.string()).min(2).max(4).describe("Race ids or distinctive names"),
      year: z.number().int().optional().describe("Compare this season instead of each race's latest edition"),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ races: refs, year }) => {
    const index = await loadIndex(env);
    const picked = refs.map(ref => resolve(index, ref));
    const out = await Promise.all(picked.map(async r => {
      const full = await getJson<any>(env, `races/${r.id}.json`);
      const ed = year != null ? full.editions.find((e: any) => e.year === year) : full.editions[0];
      return {
        ...brief(env, r),
        edition: ed ? editionDetail(ed, false) : `no ${year} edition`,
        history: r.editions.map(e => ({ year: e.year, F_rci10: e.F?.rci10 ?? null, M_rci10: e.M?.rci10 ?? null })),
      };
    }));
    return text(out);
  });

  server.registerTool("methodology", {
    description: "How RCI and the other figures are computed, the data sources, the women's score conversion, and the limits. Use it to explain or caveat an answer.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => text({
    rci: "RCI_N = mean(top N scores) − population standard deviation(top N), computed per gender. RCI10 is the reference; RCI3 is about the podium, RCI20 about depth. No RCI10 under 10 finishers with a score.",
    origin: "Realized Competition Index, proposed by Travis Loncar on Freetrail (Jan 2026): https://fantasy.freetrail.com/news/2026/01/realized-competition-index. 'Realized' = computed from results, not from the start list.",
    scores: "ITRA Race Score of each finisher (main source). UTMB Index shown alongside when available; the two scales are not comparable with each other. A few old editions come from an archive capped at 249 finishers.",
    women: "Women's scores are converted to the men's scale before computing anything: ITRA (−0.000466·s + 1.532)·s, UTMB (−0.000397·s + 1.481)·s (Enduraw, published by Distances+). Top 10 result lists keep the published score.",
    other_metrics: "mean/median/sd of the converted top 10 and top 20; depth = finishers with a converted score at or above 800/750/700/650; gap_1st_10th = score of 1st minus 10th.",
    limits: "Only finishers with a score count (DNFs and unscored runners are ignored). Depends on the day: one dominant winner with a weak chasing group lowers RCI10. A gap of a few points is not meaningful.",
    site: env.SITE_URL,
  }));

  return server;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(`Trail Density MCP server. Endpoint: ${url.origin}/mcp (Streamable HTTP, no auth). Site: ${env.SITE_URL}\n`, { headers: { "Content-Type": "text/plain" } });
    }
    return createMcpHandler(() => createServer(env))(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
