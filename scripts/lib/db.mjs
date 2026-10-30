// Writes to the v2 schema over a direct Postgres connection (DATABASE_URL in .env).
// Every write is idempotent: re-running an import replaces the same rows.
import postgres from "postgres";

export function connect() {
  try { process.loadEnvFile(".env"); } catch { /* optional */ }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing — copy .env.example to .env and fill it in");
  return postgres(url, { max: 1, onnotice: () => {}, transform: { undefined: null } });
}

// Upserts events / races / editions from the catalog (metadata only, results untouched).
export async function syncCatalog(sql, events) {
  await sql.begin(async tx => {
    for (const ev of events) {
      await tx`
        INSERT INTO v2.events (id, name, country, website) VALUES (${ev.id}, ${ev.name}, ${ev.country}, ${ev.website})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, website = EXCLUDED.website`;
      for (const r of ev.races) {
        await tx`
          INSERT INTO v2.races (id, event_id, name, discipline, distance_km, elevation_gain, series)
          VALUES (${r.id}, ${ev.id}, ${r.name}, ${r.discipline}, ${r.distance_km}, ${r.elevation_gain}, ${r.series})
          ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, name = EXCLUDED.name, discipline = EXCLUDED.discipline,
            distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain, series = EXCLUDED.series`;
        for (const e of r.editions) {
          await tx`
            INSERT INTO v2.editions (id, race_id, year, date, distance_km, elevation_gain, series, itra_id, itra_url, utmb_uri)
            VALUES (${e.id}, ${r.id}, ${e.year}, ${e.date}, ${e.distance_km}, ${e.elevation_gain}, ${e.series},
                    ${e.itra_id}, ${e.itra_url}, ${e.utmb_uri})
            ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, distance_km = EXCLUDED.distance_km,
              elevation_gain = EXCLUDED.elevation_gain, series = EXCLUDED.series, itra_id = EXCLUDED.itra_id,
              itra_url = EXCLUDED.itra_url, utmb_uri = EXCLUDED.utmb_uri`;
        }
      }
    }
  });
}

// Catalog entries that no longer exist → reported, deleted only with prune=true.
export async function findOrphans(sql, events) {
  const raceIds = events.flatMap(ev => ev.races.map(r => r.id));
  const editionIds = events.flatMap(ev => ev.races.flatMap(r => r.editions.map(e => e.id)));
  const eventIds = events.map(ev => ev.id);
  // Result sets whose source is no longer declared for the edition (same rule as import.mjs).
  const expected = new Set(events.flatMap(ev => ev.races.flatMap(r => r.editions.flatMap(e => {
    const sources = [e.itra_url && "itra", e.utmb_uri && "utmb"].filter(Boolean);
    return (sources.length ? sources : e.legacy.length ? ["legacy"] : []).map(s => `${e.id}|${s}`);
  }))));
  const sets = (await sql`SELECT edition_id, source FROM v2.result_sets`)
    .map(r => `${r.edition_id}|${r.source}`).filter(k => !expected.has(k));
  return {
    events: (await sql`SELECT id FROM v2.events WHERE id <> ALL(${eventIds})`).map(r => r.id),
    races: (await sql`SELECT id FROM v2.races WHERE id <> ALL(${raceIds})`).map(r => r.id),
    editions: (await sql`SELECT id FROM v2.editions WHERE id <> ALL(${editionIds})`).map(r => r.id),
    sets,
  };
}

export async function deleteOrphans(sql, orphans) {
  await sql.begin(async tx => {
    for (const key of orphans.sets) {
      const [editionId, source] = key.split("|");
      await tx`DELETE FROM v2.result_sets WHERE edition_id = ${editionId} AND source = ${source}`;
    }
    if (orphans.editions.length) await tx`DELETE FROM v2.editions WHERE id = ANY(${orphans.editions})`;
    if (orphans.races.length) await tx`DELETE FROM v2.races WHERE id = ANY(${orphans.races})`;
    if (orphans.events.length) await tx`DELETE FROM v2.events WHERE id = ANY(${orphans.events})`;
  });
}

// n_results of the race's other editions for the same source (feeds the size sanity check).
export async function previousCounts(sql, raceId, editionId, source) {
  const rows = await sql`
    SELECT rs.n_results FROM v2.result_sets rs JOIN v2.editions e ON e.id = rs.edition_id
    WHERE e.race_id = ${raceId} AND rs.edition_id <> ${editionId} AND rs.source = ${source}`;
  return rows.map(r => r.n_results);
}

export async function existingResultSets(sql) {
  const rows = await sql`SELECT edition_id, source, raw_sha256 FROM v2.result_sets`;
  return new Map(rows.map(r => [`${r.edition_id}|${r.source}`, r.raw_sha256]));
}

// Replaces one edition × source result set, its results and its stats, atomically.
export async function publishResultSet(sql, { editionId, source, fetchedAt, rawFile, rawSha256, results, warnings, stats }) {
  await sql.begin(async tx => {
    await tx`DELETE FROM v2.result_sets WHERE edition_id = ${editionId} AND source = ${source}`;
    const [set] = await tx`
      INSERT INTO v2.result_sets (edition_id, source, fetched_at, raw_file, raw_sha256, n_results, n_female, warnings)
      VALUES (${editionId}, ${source}, ${fetchedAt}, ${rawFile}, ${rawSha256}, ${results.length},
              ${results.filter(r => r.gender === "F").length}, ${warnings})
      RETURNING id`;
    const rows = results.map(r => ({
      result_set_id: set.id, rank: r.rank, gender_rank: r.gender_rank, gender: r.gender,
      index: r.index, runner: r.runner, nationality: r.nationality, time_s: r.time_s,
    }));
    for (let i = 0; i < rows.length; i += 5000) await tx`INSERT INTO v2.results ${tx(rows.slice(i, i + 5000))}`;
    for (const s of stats) {
      await tx`
        INSERT INTO v2.edition_stats (edition_id, source, gender, n_finishers, normalization, rci3, rci5, rci10, rci20, top_scores)
        VALUES (${editionId}, ${source}, ${s.gender}, ${s.n_finishers}, ${s.normalization},
                ${s.rci3}, ${s.rci5}, ${s.rci10}, ${s.rci20}, ${s.top_scores})`;
    }
  });
}
