// Recomputes v2.edition_stats from the results already in the database, without fetching anything.
// Run after changing scripts/lib/stats.mjs (RCI definition, normalization).
//   node scripts/recompute-stats.mjs [source]      e.g. `utmb` to only redo UTMB sets
import { connect } from "./lib/db.mjs";
import { computeEditionStats } from "./lib/stats.mjs";

const only = process.argv[2];
const sql = connect();
const sets = await sql`SELECT id, edition_id, source FROM v2.result_sets ${only ? sql`WHERE source = ${only}` : sql``} ORDER BY edition_id`;
let changed = 0;
for (const set of sets) {
  const results = await sql`SELECT rank, gender_rank, gender, index FROM v2.results WHERE result_set_id = ${set.id}`;
  const stats = computeEditionStats(results.map(r => ({ ...r, index: Number(r.index) })), set.source);
  const before = await sql`SELECT gender, rci10 FROM v2.edition_stats WHERE edition_id = ${set.edition_id} AND source = ${set.source}`;
  await sql.begin(async tx => {
    await tx`DELETE FROM v2.edition_stats WHERE edition_id = ${set.edition_id} AND source = ${set.source}`;
    for (const s of stats) {
      await tx`
        INSERT INTO v2.edition_stats (edition_id, source, gender, n_finishers, normalization, rci3, rci5, rci10, rci20, top_scores)
        VALUES (${set.edition_id}, ${set.source}, ${s.gender}, ${s.n_finishers}, ${s.normalization},
                ${s.rci3}, ${s.rci5}, ${s.rci10}, ${s.rci20}, ${s.top_scores})`;
    }
  });
  for (const s of stats) {
    const old = before.find(b => b.gender === s.gender)?.rci10;
    if (old != null && s.rci10 != null && Math.abs(Number(old) - s.rci10) > 0.005) {
      changed++;
      console.log(`${set.edition_id} ${set.source} ${s.gender}  RCI10 ${Number(old).toFixed(2)} → ${s.rci10.toFixed(2)}`);
    }
  }
}
console.log(`${sets.length} result sets recomputed, ${changed} RCI10 changed`);
await sql.end();
