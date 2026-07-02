import { state } from './state.js';
import { parseItraHtml } from './lib/parse-itra.js';
import { parseBulkCsv, itraUrlToMeta, makeRaceSlug } from './lib/parse.js';
import { saveRaceToSupabase } from './import-itra.js';

export function renderBulkPreview() {
  const tbody = document.querySelector("#bulkPreviewTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const row of state.bulkRows) {
    const icon = row.status === "pending" ? "⏳"
      : row.status === "fetching" ? "⟳"
      : row.status === "done" ? "✓"
      : "✗";
    const detail = row.status === "done" && row.resultCount ? ` (${row.resultCount})` : row.status === "error" ? ` ${row.error || ""}` : "";
    const urlShort = row.url.replace("https://itra.run/Races/RaceResults/", "").slice(0, 55);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.country ?? "-"}</td><td>${row.computedName ?? row.name ?? "-"}<br><span style="font-size:10px;color:var(--muted);">${row.computedRaceId ?? ""}</span></td><td>${row.km ?? "-"}</td><td>${row.elevation ?? "-"}</td><td title="${row.url}" style="font-size:11px;color:var(--muted);">${urlShort}</td><td style="white-space:nowrap;">${icon}${detail}</td>`;
    tbody.appendChild(tr);
  }
  const countEl = document.getElementById("bulkCount");
  if (countEl) countEl.textContent = `${state.bulkRows.length} races`;
}

export function setBulkStatus(message, type = "") {
  const el = document.getElementById("bulkStatus");
  if (!el) return;
  el.style.display = "block";
  el.className = `status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

export function parseBulkCsvAction() {
  const text = document.getElementById("bulkCsvInput")?.value || "";
  state.bulkRows = parseBulkCsv(text);
  renderBulkPreview();
  if (state.bulkRows.length) {
    setBulkStatus(`${state.bulkRows.length} races parsed — review below, then Start Import.`, "");
  } else {
    setBulkStatus("No valid rows found. Expected: country, name, km, elevation, top10avg, itra-url", "error");
  }
}

export async function fetchAndSaveBulkRow(row, cookieHeader) {
  const resp = await fetch("/api/itra-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: row.url, cookieHeader })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `Proxy error ${resp.status}`);
  }
  const html = await resp.text();
  const results = parseItraHtml(html, row.url);
  const urlMeta = itraUrlToMeta(row.url);
  const raceId = row.computedRaceId || urlMeta.raceId || "";
  const meta = {
    race_id: raceId,
    race_slug: makeRaceSlug(raceId),
    itra_id: urlMeta.itraId || null,
    name: row.computedName || urlMeta.name || "",
    series: [],
    country: row.country || null,
    data_source: "ITRA",
    year: urlMeta.year || null,
    distance_km: row.km || null,
    elevation_m: row.elevation || null,
    prize_money: null,
    notes: null,
    source_url: row.url
  };
  if (!meta.race_id) throw new Error("Could not derive race_id from CSV name/km/year");
  const { count } = await saveRaceToSupabase(meta, results);
  row.resultCount = count;
}

export async function startBulkImport() {
  if (state.bulkRunning) return;
  const cookieHeader = (document.getElementById("bulkItraToken")?.value || "").trim();
  if (!cookieHeader) { setBulkStatus("Paste your ITRA cookie header first.", "error"); return; }
  if (!state.bulkRows.length) { setBulkStatus("Parse a CSV first.", "error"); return; }

  state.bulkRunning = true;
  const btn = document.getElementById("bulkStartBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Importing…"; }

  let ok = 0, fail = 0;
  for (const row of state.bulkRows) {
    if (row.status === "done") { ok++; continue; }
    row.status = "fetching";
    renderBulkPreview();
    setBulkStatus(`Importing ${ok + fail + 1} / ${state.bulkRows.length}: ${row.name || row.url}…`);
    try {
      await fetchAndSaveBulkRow(row, cookieHeader);
      row.status = "done";
      ok++;
    } catch (err) {
      row.status = "error";
      row.error = err.message;
      fail++;
    }
    renderBulkPreview();
  }

  state.bulkRunning = false;
  if (btn) { btn.disabled = false; btn.textContent = "Start Import"; }
  setBulkStatus(`Done — ${ok} imported, ${fail} failed.`, fail === 0 ? "ok" : ok > 0 ? "" : "error");
}
