// Checks that the saved session can fetch ITRA results and UTMB results without manual cookies.
// Usage: node scripts/probe.mjs [--headless]  (ITRA needs a visible window)
import { openSession, fetchItraResultsHtml, getUtmbToken } from "./lib/session.mjs";

const ITRA_URL = "https://itra.run/Races/RaceResults/HOKA.UTMB®.MONT.BLANC.CCC®/2025/107989";
const UTMB_URI = "141.hokautmbmont-blancccc.2025";

const context = await openSession({ headless: process.argv.includes("--headless") });
try {
  try {
    const html = await fetchItraResultsHtml(context, ITRA_URL);
    const rows = (html.match(/<tr/g) || []).length;
    console.log(`ITRA  ✓ page reçue (${(html.length / 1024).toFixed(0)} KB, ~${rows} lignes, table: ${html.includes('id="RunnerRaceResults"')})`);
  } catch (e) {
    console.log(`ITRA  ✗ ${e.message}`);
  }

  const token = await getUtmbToken(context);
  if (!token) {
    console.log("UTMB  ✗ pas de token access_token (non connecté ou expiré)");
  } else {
    const resp = await fetch(`https://api.utmb.world/races/${UTMB_URI}/results?lang=en&offset=0&limit=5`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "worldseries", accept: "application/json" },
    });
    console.log(`UTMB  ${resp.ok ? "✓" : "✗"} HTTP ${resp.status}`);
  }
} finally {
  await context.close();
}
