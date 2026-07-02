import { state } from './state.js';
import { setActiveTab } from './navigation.js';
import { parseBulkCsvAction } from './bulk-import.js';

function setDiscoverStatus(msg, type) {
  const el = document.getElementById("discoverStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (type ? ` ${type}` : "");
  el.style.display = msg ? "" : "none";
}

function itraDateFormat(val) {
  const [y, m, d] = val.split("-");
  return `${d}-${m}-${y}`;
}

export async function discoverSearch() {
  const countriesRaw = document.getElementById("discoverCountry")?.value || "";
  const countries = countriesRaw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const dateStart = document.getElementById("discoverDateStart")?.value;
  const dateEnd = document.getElementById("discoverDateEnd")?.value;
  const minKm = parseFloat(document.getElementById("discoverMinKm")?.value) || 0;
  const maxKm = parseFloat(document.getElementById("discoverMaxKm")?.value) || null;

  if (!countries.length) { setDiscoverStatus("Enter at least one country code (e.g. FR).", "error"); return; }
  if (!dateStart || !dateEnd) { setDiscoverStatus("Set both From and To dates.", "error"); return; }

  setDiscoverStatus("Searching itra.run…");
  document.getElementById("discoverSearchBtn").disabled = true;
  document.getElementById("discoverFeedBtn").disabled = true;
  document.getElementById("discoverResultsPanel").style.display = "none";

  try {
    const resp = await fetch("/api/discover-races", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countries, dateStart: itraDateFormat(dateStart), dateEnd: itraDateFormat(dateEnd) }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    let races = data.races;
    if (minKm > 0) races = races.filter(r => (r.km ?? 0) >= minKm);
    if (maxKm) races = races.filter(r => (r.km ?? Infinity) <= maxKm);

    state.discoverRaces = races;
    renderDiscoverResults();

    const countEl = document.getElementById("discoverCount");
    if (countEl) countEl.textContent = `${races.length} races`;

    if (races.length) {
      setDiscoverStatus(`Found ${races.length} races with published results.${data.total !== races.length ? ` (${data.total - races.length} filtered by km range)` : ""}`, "");
      document.getElementById("discoverResultsPanel").style.display = "";
      document.getElementById("discoverFeedBtn").disabled = false;
    } else {
      setDiscoverStatus("No races found matching your filters.", "error");
    }
  } catch (err) {
    setDiscoverStatus("Error: " + err.message, "error");
  } finally {
    document.getElementById("discoverSearchBtn").disabled = false;
  }
}

function renderDiscoverResults() {
  const tbody = document.getElementById("discoverTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of state.discoverRaces) {
    const urlShort = r.url.replace("https://itra.run/Races/RaceResults/", "…/");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.country || ""}</td>
      <td>${r.name || ""}</td>
      <td style="text-align:right;">${r.km ?? ""}</td>
      <td style="text-align:right;">${r.elevation ?? ""}</td>
      <td><a href="${r.url}" target="_blank" style="font-size:11px;">${urlShort}</a></td>
    `;
    tbody.appendChild(tr);
  }
}

export function feedDiscoverToBulk() {
  if (!state.discoverRaces.length) return;
  const csv = state.discoverRaces
    .map(r => [r.country ?? "", r.name ?? "", r.km ?? "", r.elevation ?? "", "", r.url].join(","))
    .join("\n");
  const ta = document.getElementById("bulkCsvInput");
  if (ta) ta.value = csv;
  setActiveTab("bulk");
  parseBulkCsvAction();
}
