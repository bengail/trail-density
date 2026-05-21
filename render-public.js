import { state } from './state.js';
import { getManifestEntries, getCourseMeta, loadCourse, getMetaLabel } from './data.js';
import { normalizeSeries, inferRaceGender, getRciResultsForMode } from './lib/normalize.js';
import { rciFromResults } from './lib/rci.js';
import { matchesFilters, fuzzyMatch, densityColor } from './lib/filters.js';
import { rowsToCsv } from './lib/csv.js';
import { fmt } from './lib/math.js';
import { triggerCsvDownload } from './download.js';
import { updateVisualization, updateCharts } from './charts.js';

export function renderCourseList(targetEl, selectedSet, searchQuery, options = {}) {
  const q = (searchQuery || "").trim().toLowerCase();
  targetEl.innerHTML = "";

  for (const c of getManifestEntries()) {
    const id = c.race_id;
    const meta = getCourseMeta(id) || {};
    const name = (meta.name || "").toLowerCase();
    const idText = id.toLowerCase();

    if (q && !idText.includes(q) && !name.includes(q)) continue;
    if (options.filters && !matchesFilters(meta, options.filters)) continue;

    const div = document.createElement("div");
    div.className = "item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedSet.has(id);
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSet.add(id);
      else selectedSet.delete(id);
      if (options.onSelectionChange) options.onSelectionChange();
      else updateAll();
    });

    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = meta.name || id;

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = getMetaLabel(meta);

    div.appendChild(cb);
    div.appendChild(label);
    div.appendChild(pill);
    targetEl.appendChild(div);
  }
}

export async function renderPublicRciTable() {
  const table = document.getElementById("publicRciTable");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const gender = state.publicRciGender;
  const rows = await getRciRowsForGender(gender, {
    selectedSet: state.rciNormSelected,
    filters: state.rciNormFilters,
    sorts: state.rciNormSorts,
    normalizeFemale: true
  });

  const allMetrics = rows.flatMap(r => [r.rc3, r.rc5, r.rc10, r.rc20]).filter(Number.isFinite);
  const minVal = allMetrics.length ? Math.min(...allMetrics) : 0;
  const maxVal = allMetrics.length ? Math.max(...allMetrics) : 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td style="font-weight:600;">${r.name}</td>
      <td style="color:var(--muted);">${r.country || "-"}</td>
      <td style="color:var(--muted);">${r.series || "-"}</td>
      <td class="col-extra" style="${densityColor(r.rc3, minVal, maxVal)}">${fmt(r.rc3, 2)}</td>
      <td style="${densityColor(r.rc5, minVal, maxVal)}">${fmt(r.rc5, 2)}</td>
      <td style="${densityColor(r.rc10, minVal, maxVal)}">${fmt(r.rc10, 2)}</td>
      <td class="col-extra" style="${densityColor(r.rc20, minVal, maxVal)}">${fmt(r.rc20, 2)}</td>
    `;
    tbody.appendChild(tr);
  }

  const sort = state.rciNormSorts[gender];
  for (const th of table.querySelectorAll("thead th[data-key]")) {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.key === sort.key) th.classList.add(sort.dir === "asc" ? "sort-asc" : "sort-desc");
  }
}

export function wirePublicChipFilters() {
  const chipState = { activeSeries: new Set(), activeYears: new Set([2025]), activeCountry: "", isManual: false };

  function allSeriesFromData() {
    const s = new Set();
    for (const c of getManifestEntries()) {
      for (const v of normalizeSeries(getCourseMeta(c.race_id)?.series)) {
        if (v.toLowerCase() !== "none") s.add(v);
      }
    }
    return Array.from(s).sort();
  }

  function allYearsFromData() {
    const y = new Set();
    for (const c of getManifestEntries()) {
      const yr = getCourseMeta(c.race_id)?.year;
      if (yr) y.add(yr);
    }
    return Array.from(y).sort((a, b) => b - a);
  }

  function allCountriesFromData() {
    const s = new Set();
    for (const c of getManifestEntries()) {
      const country = getCourseMeta(c.race_id)?.country;
      if (country) s.add(country);
    }
    return Array.from(s).sort();
  }

  function applyChipSelection() {
    state.rciNormSelected.clear();
    for (const c of getManifestEntries()) {
      const meta = getCourseMeta(c.race_id);
      const raceSeries = normalizeSeries(meta?.series);
      const raceYear = meta?.year;
      const seriesOk = !chipState.activeSeries.size || raceSeries.some(s => chipState.activeSeries.has(s));
      const yearOk = !chipState.activeYears.size || chipState.activeYears.has(raceYear);
      if (seriesOk && yearOk) state.rciNormSelected.add(c.race_id);
    }
  }

  function renderSeriesChips() {
    const container = document.getElementById("publicSeriesChips");
    if (!container) return;
    container.innerHTML = "";
    for (const s of allSeriesFromData()) {
      const btn = document.createElement("button");
      btn.className = "chip" + (chipState.activeSeries.has(s) ? " active" : "");
      btn.textContent = s;
      btn.addEventListener("click", () => {
        if (chipState.activeSeries.has(s)) chipState.activeSeries.delete(s);
        else chipState.activeSeries.add(s);
        chipState.isManual = false;
        applyChipSelection();
        renderSeriesChips(); renderYearChips(); renderPublicRaceList(); triggerUpdate();
      });
      container.appendChild(btn);
    }
  }

  function renderYearChips() {
    const container = document.getElementById("publicYearChips");
    if (!container) return;
    container.innerHTML = "";
    for (const y of allYearsFromData()) {
      const btn = document.createElement("button");
      btn.className = "chip" + (chipState.activeYears.has(y) ? " active" : "");
      btn.textContent = String(y);
      btn.addEventListener("click", () => {
        if (chipState.activeYears.has(y)) chipState.activeYears.delete(y);
        else chipState.activeYears.add(y);
        chipState.isManual = false;
        applyChipSelection();
        renderSeriesChips(); renderYearChips(); renderPublicRaceList(); triggerUpdate();
      });
      container.appendChild(btn);
    }
  }

  function renderCountryChips() {
    const container = document.getElementById("publicCountryChips");
    if (!container) return;
    container.innerHTML = "";
    for (const country of allCountriesFromData()) {
      const btn = document.createElement("button");
      btn.className = "chip" + (chipState.activeCountry === country ? " active" : "");
      btn.textContent = country;
      btn.addEventListener("click", () => {
        chipState.activeCountry = chipState.activeCountry === country ? "" : country;
        state.rciNormFilters.country = chipState.activeCountry;
        renderCountryChips(); renderPublicRaceList(); triggerUpdate();
      });
      container.appendChild(btn);
    }
  }

  function getRaceSearchQuery() {
    const el = document.getElementById("publicRaceSearch");
    return el ? el.value.trim() : "";
  }

  function renderPublicRaceList() {
    const list = document.getElementById("publicRaceList");
    if (!list) return;
    list.innerHTML = "";
    const q = getRaceSearchQuery();
    for (const c of getManifestEntries()) {
      const id = c.race_id;
      const meta = getCourseMeta(id) || {};
      const name = meta.name || id;
      if (q && !fuzzyMatch(q, name) && !fuzzyMatch(q, id)) continue;
      if (chipState.activeCountry && meta.country !== chipState.activeCountry) continue;
      const item = document.createElement("div");
      item.className = "item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.rciNormSelected.has(id);
      cb.addEventListener("change", () => {
        chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.isManual = true;
        if (cb.checked) state.rciNormSelected.add(id);
        else state.rciNormSelected.delete(id);
        renderSeriesChips(); renderYearChips(); updateCountBadge(); triggerUpdate();
      });
      const label = document.createElement("div");
      label.className = "item-label";
      label.textContent = name;
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = meta.year ? String(meta.year) : "-";
      item.appendChild(cb); item.appendChild(label); item.appendChild(pill);
      list.appendChild(item);
    }
    updateCountBadge();
  }

  function updateCountBadge() {
    const n = state.rciNormSelected.size;
    const el = document.getElementById("publicRaceCount");
    if (el) el.textContent = String(n);
    const vizEl = document.getElementById("vizCount");
    if (vizEl) vizEl.textContent = String(n);
    const chartsEl = document.getElementById("chartsVizCount");
    if (chartsEl) chartsEl.textContent = String(n);
  }

  async function triggerUpdate() {
    await renderPublicRciTable();
    if (state.activeTab === "visualization") await updateVisualization();
    if (state.activeTab === "charts") await updateCharts();
  }

  const toggleBtn = document.getElementById("publicRacesToggleBtn");
  const raceListEl = document.getElementById("publicRaceList");
  const raceSearchEl = document.getElementById("publicRaceSearch");
  if (toggleBtn && raceListEl) {
    toggleBtn.addEventListener("click", () => {
      const wasHidden = raceListEl.hidden;
      raceListEl.hidden = !wasHidden;
      if (raceSearchEl) raceSearchEl.style.display = wasHidden ? "" : "none";
      toggleBtn.setAttribute("aria-expanded", wasHidden ? "true" : "false");
    });
  }
  if (raceSearchEl) {
    raceSearchEl.addEventListener("input", () => renderPublicRaceList());
  }

  const allBtn = document.getElementById("publicSelectAll");
  if (allBtn) allBtn.addEventListener("click", () => {
    chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.isManual = true;
    for (const c of getManifestEntries()) state.rciNormSelected.add(c.race_id);
    renderSeriesChips(); renderYearChips(); renderPublicRaceList(); triggerUpdate();
  });

  const noneBtn = document.getElementById("publicSelectNone");
  if (noneBtn) noneBtn.addEventListener("click", () => {
    chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.isManual = true;
    state.rciNormSelected.clear();
    renderSeriesChips(); renderYearChips(); renderPublicRaceList(); triggerUpdate();
  });

  applyChipSelection();
  renderSeriesChips();
  renderYearChips();
  renderCountryChips();
  renderPublicRaceList();
}

export function setSelectionByYear(selectedSet, year, filters = null) {
  selectedSet.clear();
  for (const c of getManifestEntries()) {
    const meta = getCourseMeta(c.race_id);
    if (meta?.year === year && (!filters || matchesFilters(meta, filters))) selectedSet.add(c.race_id);
  }
}

export function setSelectionAll(selectedSet) {
  selectedSet.clear();
  for (const c of getManifestEntries()) selectedSet.add(c.race_id);
}

export function setSelectionNone(selectedSet) {
  selectedSet.clear();
}

export function applyFiltersToSelection(selectedSet, filters) {
  for (const id of Array.from(selectedSet)) {
    const meta = getCourseMeta(id);
    if (!matchesFilters(meta, filters)) selectedSet.delete(id);
  }
}

export async function getRciRowsForGender(gender, options = {}) {
  const selectedSet = options.selectedSet || state.rciNormSelected;
  const filters = options.filters || state.rciNormFilters;
  const sorts = options.sorts || state.rciNormSorts;
  const normalizeFemale = Boolean(options.normalizeFemale);

  const ids = Array.from(selectedSet).sort();
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const rows = [];

  for (let i = 0; i < ids.length; i++) {
    const course = courses[i];
    if (!course) continue;
    const meta = course.meta || {};
    if (!matchesFilters(meta, filters)) continue;
    const raceGender = inferRaceGender(meta);
    if (raceGender && raceGender !== gender) continue;
    const filtered = getRciResultsForMode(course.results, gender, normalizeFemale);
    const name = course.meta?.name || course.meta?.race_id || ids[i];
    const row = {
      name,
      country: meta.country || "",
      series: normalizeSeries(meta.series).join(", "),
      rc3: rciFromResults(filtered, 3, false),
      rc5: rciFromResults(filtered, 5, false),
      rc10: rciFromResults(filtered, 10, false),
      rc20: rciFromResults(filtered, 20, false)
    };
    if (![row.rc3, row.rc5, row.rc10, row.rc20].some(Number.isFinite)) continue;
    rows.push(row);
  }

  const sort = sorts[gender];
  rows.sort((a, b) => {
    const va = a[sort.key]; const vb = b[sort.key];
    const aNum = Number.isFinite(va); const bNum = Number.isFinite(vb);
    let cmp = 0;
    if (aNum && bNum) cmp = va - vb;
    else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return rows;
}

export async function exportRciCsv(gender, options = {}) {
  const rows = await getRciRowsForGender(gender, options);
  const csv = rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = options.normalizeFemale ? "normalized_" : "";
  const filename = gender === "female"
    ? `rci_${suffix}female_${stamp}.csv`
    : `rci_${suffix}male_${stamp}.csv`;
  triggerCsvDownload(filename, csv);
}
