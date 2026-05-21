import { state } from './state.js';
import { getManifestEntries, getCourseMeta, loadCourse, courseMetaCache, courseCache, getMetaLabel } from './data.js';
import { normalizeSeries } from './lib/normalize.js';
import { parseSeriesInput, parseNullableNumber, asNullableText } from './lib/parse.js';

export function renderRaceList(searchQuery) {
  const list = document.getElementById("raceList");
  if (!list) return;
  const q = (searchQuery || "").trim().toLowerCase();
  list.innerHTML = "";
  for (const c of getManifestEntries()) {
    const id = c.race_id;
    const meta = getCourseMeta(id) || {};
    const name = (meta.name || "").toLowerCase();
    const idText = id.toLowerCase();
    if (q && !idText.includes(q) && !name.includes(q)) continue;
    const row = document.createElement("div");
    row.className = "item";
    const rb = document.createElement("input");
    rb.type = "radio";
    rb.name = "raceSelector";
    rb.checked = state.raceSelected === id;
    rb.addEventListener("change", () => { state.raceSelected = id; updateRaceDisplay(); });
    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = meta.name || id;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = getMetaLabel(meta);
    row.appendChild(rb); row.appendChild(label); row.appendChild(pill);
    list.appendChild(row);
  }
}

function renderMetaCard(key, value) {
  const safe = value === null || value === undefined || value === "" ? "-" : String(value);
  return `<div class="metaCard"><div class="k">${key}</div><div class="v">${safe}</div></div>`;
}

export async function updateRaceDisplay() {
  if (!state.raceSelected) return;
  const course = await loadCourse(state.raceSelected).catch(() => null);
  if (!course) return;
  const meta = course.meta || {};
  const metaEl = document.getElementById("raceMeta");
  if (!metaEl) return;
  const series = normalizeSeries(meta.series).join(", ");
  const sourceLink = meta.source_url
    ? `<a href="${meta.source_url}" target="_blank" rel="noopener noreferrer">${meta.source_url}</a>`
    : "-";
  metaEl.innerHTML = [
    renderMetaCard("Name", meta.name || meta.race_id || state.raceSelected),
    renderMetaCard("Race ID", meta.race_id || state.raceSelected),
    renderMetaCard("Year", meta.year),
    renderMetaCard("Series", series),
    renderMetaCard("Country", meta.country),
    renderMetaCard("Source", meta.data_source),
    renderMetaCard("Distance (km)", meta.distance_km),
    renderMetaCard("Elevation (m)", meta.elevation_m),
    renderMetaCard("Prize money", meta.prize_money),
    renderMetaCard("Notes", meta.notes),
    `<div class="metaCard"><div class="k">Source URL</div><div class="v">${sourceLink}</div></div>`
  ].join("");

  const tbody = document.querySelector("#raceResultsTable tbody");
  if (tbody) {
    tbody.innerHTML = "";
    for (const r of (course.results || []).slice(0, 100)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.rank}</td><td>${r.runner ?? "-"}</td><td>${r.index ?? "-"}</td><td>${r.gender ?? "-"}</td><td>${r.nationality ?? "-"}</td>`;
      tbody.appendChild(tr);
    }
  }

  document.getElementById("raceEditForm")?.remove();
  document.getElementById("raceEditBtn")?.removeAttribute("disabled");
}

export function renderRaceEditForm(course) {
  document.getElementById("raceEditForm")?.remove();
  const meta = course.meta || {};
  const form = document.createElement("div");
  form.id = "raceEditForm";
  form.innerHTML = `
    <div class="edit-grid">
      <label>Name <input id="editName" value="${meta.name || ""}"></label>
      <label>Series <input id="editSeries" value="${normalizeSeries(meta.series).join(", ")}"></label>
      <label>Country <input id="editCountry" value="${meta.country || ""}"></label>
      <label>Year <input id="editYear" type="number" value="${meta.year || ""}"></label>
      <label>Distance (km) <input id="editDistanceKm" type="number" step="0.1" value="${meta.distance_km ?? ""}"></label>
      <label>Elevation (m) <input id="editElevationM" type="number" value="${meta.elevation_m ?? ""}"></label>
      <label>Data source <input id="editDataSource" value="${meta.data_source || ""}"></label>
      <label>Source URL <input id="editSourceUrl" value="${meta.source_url || ""}"></label>
      <label>Prize money <input id="editPrizeMoney" value="${meta.prize_money ?? ""}"></label>
      <label>Notes <input id="editNotes" value="${meta.notes || ""}"></label>
    </div>
    <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
      <button id="raceSaveBtn" class="chip">Save</button>
      <button id="raceCancelBtn" class="chip-sm">Cancel</button>
      <span id="raceEditStatus" class="status" style="display:none;"></span>
    </div>
  `;
  const metaEl = document.getElementById("raceMeta");
  if (metaEl) metaEl.after(form);
  document.getElementById("raceSaveBtn")?.addEventListener("click", () => saveRaceMeta(course));
  document.getElementById("raceCancelBtn")?.addEventListener("click", () => {
    form.remove();
    document.getElementById("raceEditBtn")?.removeAttribute("disabled");
  });
}

async function saveRaceMeta(course) {
  if (!window.supabaseClient) return;
  const entry = getManifestEntries().find(c => c.race_id === course.meta?.race_id);
  if (!entry?.id) return;

  const statusEl = document.getElementById("raceEditStatus");
  const saveBtn = document.getElementById("raceSaveBtn");
  if (statusEl) { statusEl.style.display = "block"; statusEl.className = "status"; statusEl.textContent = "Saving…"; }
  if (saveBtn) saveBtn.disabled = true;

  const seriesRaw = (document.getElementById("editSeries")?.value || "").trim();
  const seriesValue = seriesRaw ? seriesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

  const updates = {
    name: asNullableText(document.getElementById("editName")?.value) || course.meta.name,
    series: seriesValue,
    country: asNullableText(document.getElementById("editCountry")?.value),
    year: parseNullableNumber(document.getElementById("editYear")?.value),
    distance_km: parseNullableNumber(document.getElementById("editDistanceKm")?.value),
    elevation_m: parseNullableNumber(document.getElementById("editElevationM")?.value),
    data_source: asNullableText(document.getElementById("editDataSource")?.value),
    source_url: asNullableText(document.getElementById("editSourceUrl")?.value),
    prize_money: asNullableText(document.getElementById("editPrizeMoney")?.value),
    notes: asNullableText(document.getElementById("editNotes")?.value)
  };

  try {
    const { error } = await window.supabaseClient.from("courses").update(updates).eq("id", entry.id);
    if (error) throw new Error(error.message);
    courseMetaCache.set(course.meta.race_id, { ...course.meta, ...updates });
    courseCache.delete(course.meta.race_id);
    if (statusEl) { statusEl.className = "status ok"; statusEl.textContent = "Saved successfully."; }
    setTimeout(() => updateRaceDisplay(), 900);
  } catch (err) {
    if (statusEl) { statusEl.className = "status error"; statusEl.textContent = err.message || "Save failed."; }
    if (saveBtn) saveBtn.disabled = false;
  }
}
