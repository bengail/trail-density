export function parseItraHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.getElementById("RunnerRaceResults");
  if (!table) {
    const hasLoginHint = doc.querySelector('input[type="password"], form[action*="login"], [href*="login"]');
    if (hasLoginHint) throw new Error("SessionToken expired or invalid — log in to itra.run and copy a fresh token.");
    throw new Error("Results table not found. Check the URL and try again.");
  }

  const rows = table.querySelectorAll("tbody tr");
  const results = [];
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 7) continue;

    const rank = parseInt(cells[0].textContent.trim(), 10);
    if (!Number.isFinite(rank) || rank < 1) continue;

    const runnerLink = cells[1].querySelector("a");
    const runner = runnerLink
      ? runnerLink.textContent.replace(/\s+/g, " ").trim() || null
      : cells[1].textContent.replace(/\s+/g, " ").trim() || null;

    const scoreText = cells[3].textContent.trim();
    const index = parseInt(scoreText, 10);
    if (!Number.isFinite(index) || index <= 0) continue;

    const genderRaw = cells[5].textContent.trim().toUpperCase();
    const gender = genderRaw === "M" || genderRaw === "H" || genderRaw === "MALE" || genderRaw === "HOMME" ? "M"
      : genderRaw === "F" || genderRaw === "W" || genderRaw === "FEMALE" || genderRaw === "FEMME" ? "F"
      : null;
    const nationality = cells[6].textContent.replace(/\s+/g, " ").trim() || null;

    results.push({ rank, runner, index, gender, nationality });
  }

  if (!results.length) throw new Error("No valid results found — all rows may be missing ITRA scores.");
  return results;
}
