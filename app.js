// Trail Race Analytics
// RCI = mean(top N) − std_pop(top N). Female ITRA scores normalized via quadratic.

const MAX_INDEX_FOR_NORM = 1000;
const TAB_ALLOWLIST = {
  public: ["rcinormcharts", "visualization", "charts"],
  admin: ["race", "import"]
};
const DEFAULT_TAB_BY_MODE = {
  public: "rcinormcharts",
  admin: "race"
};
const PARITY_N_LEVELS = [5, 10, 20];

function getAppContext() {
  const path = window.location.pathname || "/";
  const isAdmin =
    path === "/admin" || path === "/admin/" ||
    path.endsWith("/admin/index.html") || path.endsWith("/admin");
  return { mode: isAdmin ? "admin" : "public", assetPrefix: isAdmin ? "../" : "" };
}

function isTabAllowed(mode, tab) {
  return (TAB_ALLOWLIST[mode] || []).includes(tab);
}

function getSafeTab(mode, desiredTab) {
  if (isTabAllowed(mode, desiredTab)) return desiredTab;
  return DEFAULT_TAB_BY_MODE[mode] || "rcinormcharts";
}

// ---- Utilities ----
function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdPop(arr) {
  if (arr.length < 1) return NaN;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
  return Math.sqrt(v);
}

function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function normalizeSeries(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeGenderLabel(value) {
  if (!value) return null;
  const lower = value.toString().trim().toLowerCase();
  if (["m", "men", "man", "male", "homme", "h"].includes(lower)) return "male";
  if (["f", "women", "woman", "female", "femme", "w"].includes(lower)) return "female";
  return null;
}

function inferRaceGender(meta) {
  const text = `${meta?.name || ""} ${meta?.race_id || ""}`.toLowerCase();
  if (text.includes("(men)") || text.includes(" men") || text.includes("(homme)") || text.includes(" homme")) return "male";
  if (text.includes("(women)") || text.includes(" women") || text.includes("(femme)") || text.includes(" femme")) return "female";
  return null;
}

function filterResultsByGender(results, gender) {
  if (!gender) return results || [];
  return (results || []).filter(r => normalizeGenderLabel(r.gender) === gender);
}

function densityColor(value, min, max) {
  if (!Number.isFinite(value)) return "";
  const clampedMin = Number.isFinite(min) ? min : value;
  const clampedMax = Number.isFinite(max) ? max : value;
  if (clampedMax <= clampedMin) return "background:hsl(224,70%,92%); color:#0f172a; font-weight:600;";
  const ratio = Math.max(0, Math.min(1, (value - clampedMin) / (clampedMax - clampedMin)));
  const lightness = 92 - ratio * 47;
  const saturation = 60 + ratio * 20;
  const bg = `hsl(224, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`;
  const textColor = lightness < 68 ? "#ffffff" : "#0f172a";
  const borderAlpha = (0.06 + ratio * 0.12).toFixed(3);
  return `background:${bg}; color:${textColor}; font-weight:600; box-shadow: inset 0 0 0 1px rgba(15,23,42,${borderAlpha});`;
}

function normalizeItraFemaleIndex(score) {
  if (!Number.isFinite(score)) return NaN;
  return ((-0.000466 * score) + 1.532) * score;
}

function topScoresFrom(results, n, limitByRank = true) {
  let valid = (results || [])
    .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index) && r.rank >= 1)
    .sort((a, b) => a.rank - b.rank);
  if (limitByRank) valid = valid.filter(r => r.rank <= n);
  return valid.slice(0, n).map(r => r.index);
}

function rciFromResults(results, n, limitByRank = true) {
  const values = topScoresFrom(results, n, limitByRank);
  if (!values.length) return NaN;
  return mean(values) - stdPop(values);
}

// ---- Data loading ----
let manifest = null;
const courseCache = new Map();
const courseMetaCache = new Map();

async function loadManifest() {
  if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient
      .from("courses").select("id, race_id").order("race_id");
    if (error) throw new Error("Supabase loadManifest: " + error.message);
    manifest = { courses: data.map(c => ({ race_id: c.race_id, id: c.id })) };
    return manifest.courses;
  }
  const resp = await fetch(`${state.assetPrefix}data/courses_index.json`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Cannot load courses_index.json");
  manifest = await resp.json();
  return manifest.courses || [];
}

function getManifestEntries() {
  return (manifest && manifest.courses) || [];
}

function getCourseMeta(raceId) {
  return courseMetaCache.get(raceId) || null;
}

function normalizeCourse(course, fallbackRaceId) {
  const meta = course.meta || {};
  const raceId = meta.race_id || fallbackRaceId;
  return {
    ...course,
    meta: { ...meta, race_id: raceId, series: normalizeSeries(meta.series) },
    results: (course.results || [])
      .map(r => ({
        rank: Number(r.rank), index: Number(r.index),
        runner: r.runner ?? null, gender: r.gender ?? null, nationality: r.nationality ?? null
      }))
      .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index))
      .sort((a, b) => a.rank - b.rank)
  };
}

async function loadCourse(raceId) {
  if (courseCache.has(raceId)) return courseCache.get(raceId);

  if (window.supabaseClient) {
    const entry = getManifestEntries().find(c => c.race_id === raceId);
    if (!entry) throw new Error("Unknown race_id: " + raceId);

    const [metaResp, resultsResp] = await Promise.all([
      window.supabaseClient
        .from("courses")
        .select("id, race_id, name, series, country, year, distance_km, elevation_m, prize_money, data_source, source_url, notes")
        .eq("id", entry.id).single(),
      window.supabaseClient
        .from("results")
        .select("rank, runner, index, gender, nationality")
        .eq("course_id", entry.id).order("rank")
    ]);

    if (metaResp.error) throw new Error("Supabase course meta: " + metaResp.error.message);
    if (resultsResp.error) throw new Error("Supabase results: " + resultsResp.error.message);

    const c = metaResp.data;
    const normalized = normalizeCourse({
      meta: {
        race_id: c.race_id, name: c.name, series: c.series, country: c.country,
        year: c.year, distance_km: c.distance_km, elevation_m: c.elevation_m,
        prize_money: c.prize_money, data_source: c.data_source,
        source_url: c.source_url, notes: c.notes
      },
      results: resultsResp.data
    }, raceId);

    courseCache.set(raceId, normalized);
    courseMetaCache.set(raceId, normalized.meta);
    return normalized;
  }

  const entry = getManifestEntries().find(c => c.race_id === raceId);
  if (!entry) throw new Error("Unknown race_id: " + raceId);
  const resp = await fetch(`${state.assetPrefix}${entry.path}`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Cannot load course json: " + entry.path);
  const normalized = normalizeCourse(await resp.json(), raceId);
  courseCache.set(raceId, normalized);
  courseMetaCache.set(raceId, normalized.meta || {});
  return normalized;
}

async function preloadAllCourseMeta() {
  if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient
      .from("courses")
      .select("id, race_id, name, series, country, year, distance_km, elevation_m, prize_money, data_source, source_url, notes")
      .order("race_id");
    if (error) throw new Error("Supabase preloadAllCourseMeta: " + error.message);
    for (const c of data) {
      courseMetaCache.set(c.race_id, {
        race_id: c.race_id, name: c.name, series: c.series || [],
        country: c.country, year: c.year, distance_km: c.distance_km,
        elevation_m: c.elevation_m, prize_money: c.prize_money,
        data_source: c.data_source, source_url: c.source_url, notes: c.notes
      });
    }
    return;
  }
  const entries = getManifestEntries();
  await Promise.all(entries.map(e => loadCourse(e.race_id).catch(() => null)));
}

// ---- UI state ----
const state = {
  appMode: "public",
  assetPrefix: "",
  raceSelected: null,
  publicRciGender: "female",
  publicRciShowExtra: false,
  rciNormSelected: new Set(),
  rciNormFilters: { country: "", series: [] },
  rciNormSorts: {
    female: { key: "rc10", dir: "desc" },
    male: { key: "rc10", dir: "desc" }
  },
  parityN: 10,
  chartsGender: "both",
  topN: 30,
  activeTab: "rcinormcharts",
  importDraft: null
};

// Viz tab shares selection with RCI tab
state.vizSelected = state.rciNormSelected;
state.vizFilters = state.rciNormFilters;

function matchesFilters(meta, filters) {
  const countryOk = !filters.country || (meta?.country || "") === filters.country;
  const seriesFilter = filters.series;
  const normalizedSeries = normalizeSeries(meta?.series);
  const seriesList = Array.isArray(seriesFilter) ? seriesFilter.filter(Boolean) : seriesFilter ? [seriesFilter] : [];
  const seriesOk = !seriesList.length || seriesList.some(s => normalizedSeries.includes(s));
  return countryOk && seriesOk;
}

function getMetaLabel(meta) {
  if (!meta?.year) return "-";
  return String(meta.year);
}

// ---- Render lists ----
function renderCourseList(targetEl, selectedSet, searchQuery, options = {}) {
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

// ---- Public RCI table ----
async function renderPublicRciTable() {
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

function wirePublicChipFilters() {
  const chipState = { activeSeries: new Set(), activeYears: new Set([2025]), isManual: false };

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

  function renderPublicRaceList() {
    const list = document.getElementById("publicRaceList");
    if (!list) return;
    list.innerHTML = "";
    for (const c of getManifestEntries()) {
      const id = c.race_id;
      const meta = getCourseMeta(id) || {};
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
      label.textContent = meta.name || id;
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
  if (toggleBtn && raceListEl) {
    toggleBtn.addEventListener("click", () => {
      const wasHidden = raceListEl.hidden;
      raceListEl.hidden = !wasHidden;
      toggleBtn.setAttribute("aria-expanded", wasHidden ? "true" : "false");
    });
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
  renderPublicRaceList();
}

// ---- Selection helpers ----
function setSelectionByYear(selectedSet, year, filters = null) {
  selectedSet.clear();
  for (const c of getManifestEntries()) {
    const meta = getCourseMeta(c.race_id);
    if (meta?.year === year && (!filters || matchesFilters(meta, filters))) selectedSet.add(c.race_id);
  }
}

function setSelectionAll(selectedSet) {
  selectedSet.clear();
  for (const c of getManifestEntries()) selectedSet.add(c.race_id);
}

function setSelectionNone(selectedSet) {
  selectedSet.clear();
}

function applyFiltersToSelection(selectedSet, filters) {
  for (const id of Array.from(selectedSet)) {
    const meta = getCourseMeta(id);
    if (!matchesFilters(meta, filters)) selectedSet.delete(id);
  }
}

// ---- RCI computation ----
function getRciResultsForMode(results, gender, normalizeFemale) {
  const filtered = filterResultsByGender(results, gender);
  if (!normalizeFemale || gender !== "female") return filtered;
  return filtered.map(r => ({ ...r, index: normalizeItraFemaleIndex(r.index) }));
}

async function getRciRowsForGender(gender, options = {}) {
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
    const row = {
      name: getCourseLabel(course),
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

// ---- CSV export ----
function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const header = ["Race", "Country", "Series", "RCI3", "RCI5", "RCI10", "RCI20"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.country || "", r.series || "",
      Number.isFinite(r.rc3) ? r.rc3.toFixed(2) : "",
      Number.isFinite(r.rc5) ? r.rc5.toFixed(2) : "",
      Number.isFinite(r.rc10) ? r.rc10.toFixed(2) : "",
      Number.isFinite(r.rc20) ? r.rc20.toFixed(2) : ""
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

function triggerCsvDownload(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

function triggerJsonDownload(filename, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

async function exportRciCsv(gender, options = {}) {
  const rows = await getRciRowsForGender(gender, options);
  const csv = rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = options.normalizeFemale ? "normalized_" : "";
  const filename = gender === "female"
    ? `rci_${suffix}female_${stamp}.csv`
    : `rci_${suffix}male_${stamp}.csv`;
  triggerCsvDownload(filename, csv);
}

// ---- Import helpers ----
function parseSeriesInput(value) {
  if (!value || !String(value).trim()) return null;
  const parts = String(value).split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : parts;
}

function parseNullableNumber(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function asNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeHeaderKey(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/﻿/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseDelimitedRow(line, delimiter) {
  return line.split(delimiter).map(cell => cell.trim());
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const first = lines[0] || "";
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) return "\t";
  if (semiCount > commaCount && semiCount > 0) return ";";
  return ",";
}

function readField(row, headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return row[idx];
  }
  return "";
}

function toNumberLoose(value) {
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  return Number(text.replace(",", "."));
}

function looksLikeHeader(cells) {
  const h = cells.map(normalizeHeaderKey);
  const known = new Set(["rank", "position", "pos", "place", "runner", "name", "athlete",
    "time", "race_score", "score", "index", "itra_score", "utmb_index",
    "gender", "sex", "nationality", "country", "nation", "nat"]);
  return h.some(v => known.has(v));
}

function findLikelyScoreCell(row) {
  for (let i = row.length - 1; i >= 1; i--) {
    const cell = String(row[i] ?? "").trim();
    if (!cell || cell.includes(":")) continue;
    const n = toNumberLoose(cell);
    if (Number.isFinite(n)) return cell;
  }
  return "";
}

function parsePastedResults(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("Results input is empty.");
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Results input is empty.");
  const firstRow = parseDelimitedRow(lines[0], delimiter);
  const hasHeader = looksLikeHeader(firstRow);
  const headers = hasHeader ? firstRow.map(normalizeHeaderKey) : [];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map(line => parseDelimitedRow(line, delimiter));
  if (!rows.length) throw new Error("No data rows found.");
  const results = [];
  for (const row of rows) {
    const rankText = readField(row, headers, ["rank", "position", "pos", "place", "overall_rank"]) || row[0] || "";
    const runnerText = readField(row, headers, ["runner", "name", "athlete", "runner_name", "full_name"]) || row[1] || "";
    const indexText = readField(row, headers, ["race_score", "score", "index", "itra_score", "utmb_index"]) || row[3] || findLikelyScoreCell(row);
    const genderText = readField(row, headers, ["gender", "sex"]) || row[5] || "";
    const nationalityText = readField(row, headers, ["nationality", "country", "nation", "nat"]) || row[6] || "";
    const rank = toNumberLoose(rankText);
    const index = toNumberLoose(indexText);
    if (!Number.isFinite(rank) || rank < 1) continue;
    if (!Number.isFinite(index)) continue;
    results.push({
      rank: Math.floor(rank),
      runner: asNullableText(runnerText),
      index,
      gender: asNullableText(genderText),
      nationality: asNullableText(nationalityText)
    });
  }
  if (!results.length) throw new Error("No valid rows found. Need numeric rank and race score/index columns.");
  results.sort((a, b) => a.rank - b.rank);
  return results;
}

// ---- ITRA fetch + parse ----
function parseItraHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.getElementById("RunnerRaceResults");
  if (!table) {
    // Likely a login redirect
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
    if (!Number.isFinite(index) || index <= 0) continue; // no score = skip (required for RCI)

    const gender = cells[5].textContent.trim() || null;
    const nationality = cells[6].textContent.replace(/\s+/g, " ").trim() || null;

    results.push({ rank, runner, index, gender, nationality });
  }

  if (!results.length) throw new Error("No valid results found — all rows may be missing ITRA scores.");
  return results;
}

function itraUrlToMeta(url) {
  // Pattern: /Races/RaceResults/{Slug}/{Year}/{NumericId}
  const m = url.match(/RaceResults\/(.+?)\/(\d{4})\/(\d+)/);
  if (!m) return {};
  const slug = m[1];   // "Black.Canyon.Ultras.100K"
  const year = parseInt(m[2], 10);
  const name = slug.replace(/\./g, " ");  // "Black Canyon Ultras 100K"
  const raceId = slug.toUpperCase().replace(/\./g, "_") + "_" + year; // "BLACK_CANYON_ULTRAS_100K_2026"
  return { name, year, raceId };
}

function setItraStatus(message, type = "") {
  const el = document.getElementById("itraStatus");
  if (!el) return;
  el.style.display = "block";
  el.className = `status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

async function fetchFromItra() {
  const url = (document.getElementById("itraUrl")?.value || "").trim();
  const sessionToken = (document.getElementById("itraToken")?.value || "").trim();
  const btn = document.getElementById("itraFetchBtn");

  if (!url) { setItraStatus("Paste an itra.run results URL first.", "error"); return; }
  if (!sessionToken) { setItraStatus("Paste your SessionToken cookie value.", "error"); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Fetching…"; }
  setItraStatus("Fetching from itra.run…");

  try {
    const resp = await fetch("/api/itra-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, sessionToken })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || `Proxy error ${resp.status}`);
    }

    const html = await resp.text();
    const results = parseItraHtml(html, url);

    // Pre-fill metadata fields from URL
    const meta = itraUrlToMeta(url);
    if (meta.raceId) {
      const raceIdEl = document.getElementById("importRaceId");
      if (raceIdEl && !raceIdEl.value) raceIdEl.value = meta.raceId;
    }
    if (meta.name) {
      const nameEl = document.getElementById("importName");
      if (nameEl && !nameEl.value) nameEl.value = meta.name;
    }
    if (meta.year) {
      const yearEl = document.getElementById("importYear");
      if (yearEl && !yearEl.value) yearEl.value = String(meta.year);
    }

    // Populate draft and preview (same pipeline as manual import)
    state.importDraft = {
      meta: {
        race_id: document.getElementById("importRaceId")?.value || meta.raceId || "",
        name: document.getElementById("importName")?.value || meta.name || "",
        series: parseSeriesInput(document.getElementById("importSeries")?.value),
        country: asNullableText(document.getElementById("importCountry")?.value),
        data_source: "ITRA",
        year: parseNullableNumber(document.getElementById("importYear")?.value) || meta.year || null,
        distance_km: parseNullableNumber(document.getElementById("importDistanceKm")?.value),
        elevation_m: parseNullableNumber(document.getElementById("importElevationM")?.value),
        prize_money: asNullableText(document.getElementById("importPrizeMoney")?.value),
        notes: asNullableText(document.getElementById("importNotes")?.value),
        source_url: url
      },
      results
    };

    // Also set data_source field in form
    const srcEl = document.getElementById("importDataSource");
    if (srcEl && !srcEl.value) srcEl.value = "ITRA";
    const srcUrlEl = document.getElementById("importSourceUrl");
    if (srcUrlEl && !srcUrlEl.value) srcUrlEl.value = url;

    renderImportPreview(results);
    setItraStatus(`${results.length} results fetched. Review metadata below, then Save to Supabase.`, "ok");
    setImportStatus(`${results.length} results loaded from ITRA. Fill any missing metadata, then save.`, "ok");
  } catch (err) {
    setItraStatus(err.message || "Fetch failed.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Fetch & Preview"; }
  }
}

function setImportStatus(message, type = "") {
  const el = document.getElementById("importStatus");
  if (!el) return;
  el.className = `status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

function renderImportPreview(results) {
  const tbody = document.querySelector("#importPreviewTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of results.slice(0, 200)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.rank}</td><td>${r.runner ?? "-"}</td><td>${fmt(r.index, 1)}</td><td>${r.gender ?? "-"}</td><td>${r.nationality ?? "-"}</td>`;
    tbody.appendChild(tr);
  }
}

function readImportDraftFromForm() {
  const raceId = (document.getElementById("importRaceId")?.value || "").trim();
  const name = (document.getElementById("importName")?.value || "").trim();
  if (!raceId) throw new Error("Race ID is required.");
  if (!name) throw new Error("Race name is required.");
  const resultsText = document.getElementById("importResultsInput")?.value || "";
  const results = parsePastedResults(resultsText);
  const meta = {
    race_id: raceId, name,
    series: parseSeriesInput(document.getElementById("importSeries")?.value),
    country: asNullableText(document.getElementById("importCountry")?.value),
    data_source: asNullableText(document.getElementById("importDataSource")?.value),
    year: parseNullableNumber(document.getElementById("importYear")?.value),
    distance_km: parseNullableNumber(document.getElementById("importDistanceKm")?.value),
    elevation_m: parseNullableNumber(document.getElementById("importElevationM")?.value),
    prize_money: asNullableText(document.getElementById("importPrizeMoney")?.value),
    notes: asNullableText(document.getElementById("importNotes")?.value),
    source_url: asNullableText(document.getElementById("importSourceUrl")?.value)
  };
  return { meta, results };
}

function buildUpdatedManifestForImport(raceId) {
  const courses = getManifestEntries().map(c => ({ race_id: c.race_id, path: c.path }));
  const newEntry = { race_id: raceId, path: `data/courses/${raceId}.json` };
  const existingIndex = courses.findIndex(c => c.race_id === raceId);
  if (existingIndex >= 0) courses[existingIndex] = newEntry; else courses.push(newEntry);
  courses.sort((a, b) => a.race_id.localeCompare(b.race_id));
  return { courses };
}

function buildImportJson() {
  try {
    const draft = readImportDraftFromForm();
    state.importDraft = draft;
    renderImportPreview(draft.results);
    setImportStatus(`JSON built successfully (${draft.results.length} results).`, "ok");
  } catch (err) {
    state.importDraft = null;
    renderImportPreview([]);
    setImportStatus(err.message || "Unable to build JSON.", "error");
  }
}

function downloadImportRaceJson() {
  if (!state.importDraft) { setImportStatus("Build JSON first before downloading.", "error"); return; }
  triggerJsonDownload(`${state.importDraft.meta?.race_id || "race"}.json`, state.importDraft);
}

function downloadImportManifestJson() {
  if (!state.importDraft) { setImportStatus("Build JSON first.", "error"); return; }
  triggerJsonDownload("courses_index.json", buildUpdatedManifestForImport(state.importDraft.meta?.race_id || ""));
}

async function importToSupabase() {
  if (!window.supabaseClient) { setImportStatus("Supabase not configured — check config.js.", "error"); return; }
  if (!state.importDraft) { setImportStatus("Preview the data first before saving.", "error"); return; }
  const { meta, results } = state.importDraft;
  const btn = document.getElementById("importSaveSupabaseBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  setImportStatus("Saving to Supabase…");
  try {
    const seriesValue = meta.series ? (Array.isArray(meta.series) ? meta.series : [meta.series]) : [];
    const courseRow = {
      race_id: meta.race_id, name: meta.name, series: seriesValue, country: meta.country,
      year: meta.year, distance_km: meta.distance_km, elevation_m: meta.elevation_m,
      prize_money: meta.prize_money, data_source: meta.data_source,
      source_url: meta.source_url, notes: meta.notes
    };
    const { data: courseData, error: courseError } = await window.supabaseClient
      .from("courses").upsert(courseRow, { onConflict: "race_id" }).select("id").single();
    if (courseError) throw new Error("Course upsert failed: " + courseError.message);
    const courseId = courseData.id;
    const { error: deleteError } = await window.supabaseClient
      .from("results").delete().eq("course_id", courseId);
    if (deleteError) throw new Error("Delete old results failed: " + deleteError.message);
    const resultRows = results.map(r => ({
      course_id: courseId, rank: r.rank, runner: r.runner,
      index: r.index, gender: r.gender, nationality: r.nationality
    }));
    const { error: insertError } = await window.supabaseClient.from("results").insert(resultRows);
    if (insertError) throw new Error("Insert results failed: " + insertError.message);
    setImportStatus(`Saved "${meta.name}" (${results.length} results). Reloading…`, "ok");
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    setImportStatus(err.message || "Save failed.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Save to Supabase"; }
  }
}

// ---- Visualization: Parity delta bar ----
function getVizFilteredIds() {
  return Array.from(state.vizSelected).sort();
}

function getTopStats(results, n) {
  const values = topScoresFrom(results, n, false);
  if (!values.length) return { mean: NaN, std: NaN, rci: NaN };
  const m = mean(values);
  const sd = stdPop(values);
  return { mean: m, std: sd, rci: m - sd };
}

async function getVizRciPoints(options = {}) {
  const ids = options.ids || getVizFilteredIds();
  const nLevels = options.nLevels || PARITY_N_LEVELS;
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const points = [];
  for (let i = 0; i < ids.length; i++) {
    const course = courses[i];
    if (!course) continue;
    const meta = course.meta || {};
    const raceGender = inferRaceGender(meta);
    for (const sex of ["male", "female"]) {
      if (raceGender && raceGender !== sex) continue;
      const normalized = getRciResultsForMode(course.results, sex, true);
      for (const n of nLevels) {
        const stats = getTopStats(normalized, n);
        if (!Number.isFinite(stats.rci)) continue;
        points.push({
          race_id: meta.race_id || ids[i],
          race_name: meta.name || meta.race_id || ids[i],
          year: meta.year,
          series: normalizeSeries(meta.series).join(", ") || "-",
          sex, n, rci: stats.rci
        });
      }
    }
  }
  return points;
}

async function renderParityVisualization() {
  const plotEl = document.getElementById("vizParityPlot");
  if (!plotEl) return;

  const noData = (msg) => Plotly.react("vizParityPlot", [], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    annotations: [{ x: 0.5, y: 0.5, xref: "paper", yref: "paper", text: msg, showarrow: false, font: { color: "#64748b", size: 13 } }]
  }, { responsive: true, displayModeBar: false });

  const ids = getVizFilteredIds();
  if (!ids.length) { noData("No races selected"); return; }

  const n = state.parityN;
  const points = await getVizRciPoints({ ids, nLevels: [n] });
  const byRace = new Map();
  for (const p of points) {
    if (!byRace.has(p.race_id)) byRace.set(p.race_id, { race_name: p.race_name, male: NaN, female: NaN });
    if (p.sex === "male") byRace.get(p.race_id).male = p.rci;
    if (p.sex === "female") byRace.get(p.race_id).female = p.rci;
  }

  const rows = Array.from(byRace.values())
    .filter(r => Number.isFinite(r.male) && Number.isFinite(r.female))
    .map(r => ({ ...r, delta: r.female - r.male }))
    .sort((a, b) => a.delta - b.delta);

  if (!rows.length) { noData("No races with both M and F data"); return; }

  Plotly.react("vizParityPlot", [{
    type: "bar",
    orientation: "h",
    x: rows.map(r => r.delta),
    y: rows.map(r => r.race_name),
    marker: { color: rows.map(r => r.delta >= 0 ? "#10b981" : "#3b82f6") },
    hovertemplate: "<b>%{y}</b><br>RCI_F − RCI_M = %{x:.2f}<extra></extra>"
  }], {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 10, r: 40, t: 10, b: 50 },
    font: { family: "Montserrat, ui-sans-serif, system-ui, sans-serif", size: 11 },
    xaxis: {
      title: `RCI_F (normalized) − RCI_M · N=${n}`,
      zeroline: true, zerolinecolor: "#94a3b8", zerolinewidth: 2,
      gridcolor: "#e2e8f0"
    },
    yaxis: { automargin: true, tickfont: { size: 10 } }
  }, { responsive: true, displayModeBar: false });
}

async function updateVisualization() {
  const vizEl = document.getElementById("vizCount");
  if (vizEl) vizEl.textContent = String(state.vizSelected.size);
  await renderParityVisualization();
}

// ---- Charts: rank curve (depth) ----
function getCourseLabel(course) {
  return course.meta?.name || course.meta?.race_id || course.race_id;
}

function groupForCharts(courses, topN, gender = "both") {
  const grouped = new Map();
  for (const c of courses) {
    const id = c.meta?.race_id || c.race_id;
    let results = (c.results || []).filter(r => r.rank >= 1 && r.rank <= topN);
    if (gender !== "both") results = filterResultsByGender(results, gender);
    results = results.sort((a, b) => a.rank - b.rank);
    grouped.set(id, { label: getCourseLabel(c), arr: results });
  }
  return grouped;
}

function updateRankPlot(grouped, topN) {
  const plotEl = document.getElementById("plot");
  if (!plotEl) return;
  const ids = Array.from(grouped.keys()).sort();
  const traces = ids.map(id => {
    const entry = grouped.get(id);
    const arr = entry?.arr || [];
    const label = entry?.label || id;
    return {
      x: arr.map(r => r.rank),
      y: arr.map(r => r.index),
      mode: "lines+markers",
      name: label,
      hovertemplate: `${label}<br>rank=%{x}<br>index=%{y:.1f}<extra></extra>`,
      fill: "tozeroy",
      fillopacity: 0.12,
      line: { width: 2 },
      marker: { size: 4 }
    };
  });

  Plotly.react("plot", traces, {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 55, r: 20, t: 10, b: 50 },
    font: { family: "Montserrat, ui-sans-serif, system-ui, sans-serif", size: 11 },
    xaxis: { title: "Rank", range: [1, topN], gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
    yaxis: { title: "Index", gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
    hovermode: "x unified"
  }, { responsive: true, displayModeBar: false });
}

async function updateCharts() {
  const el = document.getElementById("chartsVizCount");
  if (el) el.textContent = String(state.rciNormSelected.size);
  const topN = state.topN;
  const ids = Array.from(state.rciNormSelected).sort();
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const grouped = groupForCharts(courses.filter(Boolean), topN, state.chartsGender);
  updateRankPlot(grouped, topN);
}

// ---- Race browser (admin) ----
function renderRaceList(searchQuery) {
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

async function updateRaceDisplay() {
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

  const tbody = document.querySelector("#raceRankingTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of course.results || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.rank}</td><td>${r.runner ?? "-"}</td><td>${fmt(r.index, 1)}</td><td>${r.gender ?? "-"}</td><td>${r.nationality ?? "-"}</td>`;
    tbody.appendChild(tr);
  }
}

function renderRaceEditForm(course) {
  const meta = course.meta || {};
  const metaEl = document.getElementById("raceMeta");
  if (!metaEl) return;
  const series = normalizeSeries(meta.series).join(", ");
  metaEl.innerHTML = `
    <div class="formGrid" style="grid-column:1/-1;">
      <div class="field"><label>Name</label><input id="editName" value="${(meta.name || "").replace(/"/g, "&quot;")}" /></div>
      <div class="field"><label>Series</label><input id="editSeries" value="${series.replace(/"/g, "&quot;")}" /></div>
      <div class="field"><label>Country</label><input id="editCountry" value="${(meta.country || "").replace(/"/g, "&quot;")}" /></div>
      <div class="field"><label>Year</label><input id="editYear" type="number" value="${meta.year || ""}" /></div>
      <div class="field"><label>Distance (km)</label><input id="editDistanceKm" type="number" step="0.01" value="${meta.distance_km || ""}" /></div>
      <div class="field"><label>Elevation (m)</label><input id="editElevationM" type="number" step="1" value="${meta.elevation_m || ""}" /></div>
      <div class="field"><label>Data Source</label><input id="editDataSource" value="${(meta.data_source || "").replace(/"/g, "&quot;")}" /></div>
      <div class="field"><label>Source URL</label><input id="editSourceUrl" type="url" value="${(meta.source_url || "").replace(/"/g, "&quot;")}" /></div>
      <div class="field"><label>Prize Money</label><input id="editPrizeMoney" value="${(meta.prize_money || "").replace(/"/g, "&quot;")}" /></div>
      <div class="field" style="grid-column:1/-1;"><label>Notes</label><textarea id="editNotes">${meta.notes || ""}</textarea></div>
    </div>
    <div class="btns" style="grid-column:1/-1; margin-top:4px;">
      <button id="raceSaveBtn" style="background:#eef2ff; border-color:rgba(79,70,229,0.5); color:#312e81; cursor:pointer; border-radius:10px; padding:9px 14px; font-weight:700; font-size:12px;">Save</button>
      <button id="raceCancelBtn" style="cursor:pointer; border:1px solid var(--border); background:#f8fafc; border-radius:10px; padding:9px 14px; font-weight:700; font-size:12px;">Cancel</button>
    </div>
    <div id="raceEditStatus" class="status" style="grid-column:1/-1; display:none;"></div>
  `;

  document.getElementById("raceSaveBtn").addEventListener("click", () => saveRaceMeta(course));
  document.getElementById("raceCancelBtn").addEventListener("click", () => updateRaceDisplay());
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

// ---- App-mode visibility ----
function applyAppModeVisibility(mode) {
  const publicButtons = ["tabRciNorm", "vizTabParity", "tabCharts"];
  const adminButtons = ["tabRace", "tabImport"];
  const publicPages = ["pageRciNorm", "pageViz", "pageCharts"];
  const adminPages = ["pageRace", "pageImport"];

  const hide = (id, hidden) => { const el = document.getElementById(id); if (el) el.hidden = hidden; };
  const isAdmin = mode === "admin";
  for (const id of publicButtons) hide(id, isAdmin);
  for (const id of adminButtons) hide(id, !isAdmin);
  for (const id of publicPages) hide(id, isAdmin);
  for (const id of adminPages) hide(id, !isAdmin);
}

// ---- Page switching ----
function setActiveTab(tab) {
  const safeTab = getSafeTab(state.appMode, tab);
  state.activeTab = safeTab;

  const pageMap = {
    rcinormcharts: "pageRciNorm",
    visualization: "pageViz",
    charts: "pageCharts",
    race: "pageRace",
    import: "pageImport"
  };
  for (const [key, id] of Object.entries(pageMap)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === safeTab);
  }

  document.getElementById("tabRciNorm")?.classList.toggle("active", safeTab === "rcinormcharts");
  document.getElementById("vizTabParity")?.classList.toggle("active", safeTab === "visualization");
  document.getElementById("tabCharts")?.classList.toggle("active", safeTab === "charts");
  document.getElementById("tabRace")?.classList.toggle("active", safeTab === "race");
  document.getElementById("tabImport")?.classList.toggle("active", safeTab === "import");

  if (safeTab === "visualization") updateVisualization();
  if (safeTab === "charts") updateCharts();
}

// ---- Orchestrator ----
async function updateAll() {
  await renderPublicRciTable();
}

// ---- Boot ----
(async function boot() {
  const appContext = getAppContext();
  state.appMode = appContext.mode;
  state.assetPrefix = appContext.assetPrefix;
  state.activeTab = DEFAULT_TAB_BY_MODE[state.appMode];

  await loadManifest();
  await preloadAllCourseMeta();

  setSelectionByYear(state.rciNormSelected, 2025);

  if (state.appMode === "public") {
    wirePublicChipFilters();

    document.getElementById("rciTabWomen")?.addEventListener("click", () => {
      state.publicRciGender = "female";
      document.getElementById("rciTabWomen")?.classList.add("active");
      document.getElementById("rciTabMen")?.classList.remove("active");
      renderPublicRciTable();
    });
    document.getElementById("rciTabMen")?.addEventListener("click", () => {
      state.publicRciGender = "male";
      document.getElementById("rciTabMen")?.classList.add("active");
      document.getElementById("rciTabWomen")?.classList.remove("active");
      renderPublicRciTable();
    });

    document.getElementById("rciToggleExtra")?.addEventListener("click", function () {
      state.publicRciShowExtra = !state.publicRciShowExtra;
      document.getElementById("publicRciTable")?.classList.toggle("show-extra", state.publicRciShowExtra);
      this.textContent = state.publicRciShowExtra ? "− RCI3 & RCI20" : "+ RCI3 & RCI20";
      this.classList.toggle("active", state.publicRciShowExtra);
    });

    const publicTable = document.getElementById("publicRciTable");
    if (publicTable) {
      for (const th of publicTable.querySelectorAll("thead th[data-key]")) {
        th.addEventListener("click", () => {
          const g = state.publicRciGender;
          const k = th.dataset.key;
          if (state.rciNormSorts[g].key === k) {
            state.rciNormSorts[g].dir = state.rciNormSorts[g].dir === "asc" ? "desc" : "asc";
          } else {
            state.rciNormSorts[g].key = k; state.rciNormSorts[g].dir = "desc";
          }
          renderPublicRciTable();
        });
      }
    }

    // Parity N selector
    document.querySelectorAll("#parityNChips [data-n]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.parityN = Number(btn.dataset.n);
        document.querySelectorAll("#parityNChips [data-n]").forEach(b =>
          b.classList.toggle("active", Number(b.dataset.n) === state.parityN));
        updateVisualization();
      });
    });

    // Charts gender toggle
    const setChartsGender = (gender) => {
      state.chartsGender = gender;
      document.getElementById("chartsGenderBoth")?.classList.toggle("active", gender === "both");
      document.getElementById("chartsGenderMen")?.classList.toggle("active", gender === "male");
      document.getElementById("chartsGenderWomen")?.classList.toggle("active", gender === "female");
      updateCharts();
    };
    document.getElementById("chartsGenderBoth")?.addEventListener("click", () => setChartsGender("both"));
    document.getElementById("chartsGenderMen")?.addEventListener("click", () => setChartsGender("male"));
    document.getElementById("chartsGenderWomen")?.addEventListener("click", () => setChartsGender("female"));

    document.getElementById("exportRciNormFemaleCsv")?.addEventListener("click", () =>
      exportRciCsv("female", { selectedSet: state.rciNormSelected, filters: state.rciNormFilters, sorts: state.rciNormSorts, normalizeFemale: true }));
    document.getElementById("exportRciNormMaleCsv")?.addEventListener("click", () =>
      exportRciCsv("male", { selectedSet: state.rciNormSelected, filters: state.rciNormFilters, sorts: state.rciNormSorts, normalizeFemale: true }));
  }

  // Nav tabs
  document.getElementById("tabRciNorm")?.addEventListener("click", () => setActiveTab("rcinormcharts"));
  document.getElementById("vizTabParity")?.addEventListener("click", () => setActiveTab("visualization"));
  document.getElementById("tabCharts")?.addEventListener("click", () => setActiveTab("charts"));
  document.getElementById("tabRace")?.addEventListener("click", () => setActiveTab("race"));
  document.getElementById("tabImport")?.addEventListener("click", () => setActiveTab("import"));

  // Top N slider
  const elTopN = document.getElementById("topN");
  if (elTopN) {
    elTopN.value = String(state.topN);
    elTopN.addEventListener("input", () => {
      state.topN = Number(elTopN.value);
      const lbl = document.getElementById("nLabel");
      if (lbl) lbl.textContent = String(state.topN);
      updateCharts();
    });
  }

  // Admin: import
  document.getElementById("itraFetchBtn")?.addEventListener("click", fetchFromItra);
  document.getElementById("importBuildJsonBtn")?.addEventListener("click", buildImportJson);
  document.getElementById("importSaveSupabaseBtn")?.addEventListener("click", importToSupabase);
  document.getElementById("importDownloadRaceBtn")?.addEventListener("click", downloadImportRaceJson);
  document.getElementById("importDownloadIndexBtn")?.addEventListener("click", downloadImportManifestJson);

  // Admin: race browser + edit
  const raceSearch = document.getElementById("searchRace");
  if (raceSearch) {
    const firstRace = getManifestEntries()[0];
    state.raceSelected = firstRace ? firstRace.race_id : null;
    raceSearch.addEventListener("input", () => renderRaceList(raceSearch.value));
    renderRaceList("");
  }

  document.getElementById("raceEditBtn")?.addEventListener("click", async () => {
    if (!state.raceSelected) return;
    const course = await loadCourse(state.raceSelected).catch(() => null);
    if (course) renderRaceEditForm(course);
  });

  // Init Plotly placeholders
  if (document.getElementById("plot")) {
    Plotly.newPlot("plot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  }
  if (document.getElementById("vizParityPlot")) {
    Plotly.newPlot("vizParityPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  }

  applyAppModeVisibility(state.appMode);
  setActiveTab(state.activeTab);
  await updateAll();
  if (state.appMode === "admin") await updateRaceDisplay();
})();
