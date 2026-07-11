// Trail Race Analytics
// RCI = mean(top N) − std_pop(top N). Female ITRA scores normalized via quadratic.

const MAX_INDEX_FOR_NORM = 1000;
const TAB_ALLOWLIST = {
  public: ["rcinormcharts", "trends", "visualization", "charts"],
  admin: ["import", "utmb", "races"]
};
const DEFAULT_TAB_BY_MODE = {
  public: "rcinormcharts",
  admin: "import"
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
// ---- Language / i18n ----
let lang = (() => {
  const s = localStorage.getItem("trail-lang");
  if (s === "fr" || s === "en") return s;
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
})();

let indexSource = (() => {
  const s = localStorage.getItem("trail-index-source");
  return s === "utmb" ? "utmb" : "itra";
})();

const T = {
  fr: {
    subtitle: "Indice de compétitivité en trail",
    tabRci: "RCI", tabTrends: "Tendances", tabParity: "Parité", tabDepth: "Profondeur",
    selectionCount: " courses sélectionnées", editSelection: "Modifier la sélection", clearSelection: "Effacer",
    filterTitle: "Filtrer les éditions", filterClose: "Fermer",
    filterReset: "Réinitialiser", filterSeries: "Séries", filterYear: "Année",
    filterCountry: "Pays", filterRaces: "Courses", filterSearch: "Rechercher…",
    filterAll: "Tout", filterNone: "Aucun", editionsLabel: "Éditions",
    rciSubtitle: "Indice de Compétitivité en Trail — moyenne moins écart-type des indices des meilleurs finishers. Plus élevé signifie un plateau plus fort et plus homogène.",
    rciWomen: "Femmes", rciMen: "Hommes", rciToggleExtra: "+ RCI3 & RCI20",
    rciExportWomen: "↓ CSV Femmes", rciExportMen: "↓ CSV Hommes",
    rciColRace: "Course", rciColCountry: "Pays", rciColSeries: "Séries",
    rciEmptyTitle: "Commencez par choisir des courses",
    rciEmptyHint: "Sélectionnez des éditions pour afficher le classement RCI",
    trendsSubtitle: "Évolution de la densité du plateau d'une course au fil des éditions.",
    trendsSelect: "Sélectionnez une course dans la liste.",
    trendsSearchRaces: "Rechercher…", yearCol: "Année",
    trendsGenderBoth: "Les deux", trendsGenderWomen: "Femmes", trendsGenderMen: "Hommes",
    paritySubtitle: "Où le plateau féminin est relativement plus fort ou plus faible que le plateau masculin, sur une même course — dernière édition de chacune.",
    parityLegendWomen: "Champ féminin plus fort", parityLegendMen: "Champ masculin plus fort",
    depthSubtitle: "Indice par rang d'arrivée, pour les éditions sélectionnées — vitesse à laquelle le peloton s'amenuise.",
    depthGender: "Genre", depthBoth: "Les deux", depthMen: "Hommes", depthWomen: "Femmes",
    depthEmptyMsg: "Sélectionnez des éditions pour tracer leurs courbes de profondeur.",
    admin: "Admin →",
  },
  en: {
    subtitle: "Field-strength analytics for trail & ultra races",
    tabRci: "RCI", tabTrends: "Trends", tabParity: "Parity", tabDepth: "Depth",
    selectionCount: " editions selected", editSelection: "Edit selection", clearSelection: "Clear",
    filterTitle: "Filter editions", filterClose: "Close",
    filterReset: "Reset", filterSeries: "Series", filterYear: "Year",
    filterCountry: "Country", filterRaces: "Races", filterSearch: "Search…",
    filterAll: "All", filterNone: "None", editionsLabel: "Editions",
    rciSubtitle: "Race Competitiveness Index — mean minus standard deviation of the top finishers' index scores. Higher means a stronger, more even field.",
    rciWomen: "Women", rciMen: "Men", rciToggleExtra: "+ RCI3 & RCI20",
    rciExportWomen: "↓ Women CSV", rciExportMen: "↓ Men CSV",
    rciColRace: "Race", rciColCountry: "Country", rciColSeries: "Series",
    rciEmptyTitle: "Start by choosing races",
    rciEmptyHint: "Select editions to display the RCI ranking",
    trendsSubtitle: "How a race's field strength has evolved across editions.",
    trendsSelect: "Select a race from the list.",
    trendsSearchRaces: "Search…", yearCol: "Year",
    trendsGenderBoth: "Both", trendsGenderWomen: "Women", trendsGenderMen: "Men",
    paritySubtitle: "Where women's fields are relatively stronger or weaker than men's — latest edition of each race.",
    parityLegendWomen: "Women's field stronger", parityLegendMen: "Men's field stronger",
    depthSubtitle: "Index score by finishing rank — how quickly the field thins out.",
    depthGender: "Gender", depthBoth: "Both", depthMen: "Men", depthWomen: "Women",
    depthEmptyMsg: "Select editions (top bar) to plot their depth curves.",
    admin: "Admin →",
  }
};

function t(key) { return T[lang]?.[key] ?? T.en[key] ?? key; }

function applyLang() {
  for (const el of document.querySelectorAll("[data-t]")) {
    const val = T[lang]?.[el.dataset.t];
    if (val === undefined) continue;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.placeholder = val;
    else el.textContent = val;
  }
  const btn = document.getElementById("langToggle");
  if (btn) btn.textContent = lang === "fr" ? "EN" : "FR";
}

function setLang(l) {
  lang = l;
  localStorage.setItem("trail-lang", l);
  applyLang();
  if (state?.trendsRaceId) renderTrendsChart();
}

// ---- Math helpers ----
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
  const ratio = clampedMax > clampedMin
    ? Math.max(0, Math.min(1, (value - clampedMin) / (clampedMax - clampedMin)))
    : 0.5;
  const l = (0.97 - ratio * 0.10).toFixed(3);
  const c = (0.02 + ratio * 0.05).toFixed(3);
  return `background:oklch(${l} ${c} 45);`;
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
// manifest.courses entries use `race_id` = edition.id ("utmb-170-2024") as the public UI key.
// This keeps all downstream public code (chip filters, RCI table, charts) working unchanged.
let manifest = null;
const courseCache = new Map();
const courseMetaCache = new Map();

async function loadManifest() {
  if (!window.supabaseClient) return [];
  const { data, error } = await window.supabaseClient
    .from("editions")
    .select("id, race_id, year, series, races(name, country, distance_km, elevation_gain, source)")
    .order("id");
  if (error) throw new Error("loadManifest: " + error.message);
  const filtered = data.filter(e => (e.races?.source || "itra") === state.indexSource);
  manifest = { courses: filtered.map(e => ({ race_id: e.id, id: e.id })) };
  courseMetaCache.clear();
  for (const e of filtered) {
    courseMetaCache.set(e.id, {
      race_id: e.id,
      base_race_id: e.race_id,
      name: e.races?.name || e.id,
      country: e.races?.country || null,
      year: e.year,
      series: e.series || [],
      distance_km: e.races?.distance_km || null,
      elevation_gain: e.races?.elevation_gain || null,
      source: e.races?.source || "itra",
    });
  }
  return manifest.courses;
}

function getManifestEntries() {
  return (manifest && manifest.courses) || [];
}

function getCourseMeta(editionId) {
  return courseMetaCache.get(editionId) || null;
}

function normalizeResults(results) {
  return (results || [])
    .map(r => ({
      rank: Number(r.rank), index: Number(r.index),
      runner: r.runner ?? null, gender: r.gender ?? null, nationality: r.nationality ?? null
    }))
    .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index))
    .sort((a, b) => a.rank - b.rank);
}

async function loadCourse(editionId) {
  if (courseCache.has(editionId)) return courseCache.get(editionId);
  if (!window.supabaseClient) throw new Error("No Supabase client.");

  const [edResp, resResp] = await Promise.all([
    window.supabaseClient
      .from("editions")
      .select("id, race_id, year, series, date, itra_edition_url, races(name, country, distance_km, elevation_gain)")
      .eq("id", editionId).single(),
    window.supabaseClient
      .from("results")
      .select("rank, runner, index, gender, nationality")
      .eq("edition_id", editionId).order("rank")
  ]);

  if (edResp.error) throw new Error("Edition: " + edResp.error.message);
  if (resResp.error) throw new Error("Results: " + resResp.error.message);

  const e = edResp.data;
  const meta = {
    race_id: e.id,
    base_race_id: e.race_id,
    name: e.races?.name || e.id,
    country: e.races?.country || null,
    year: e.year,
    series: e.series || [],
    distance_km: e.races?.distance_km || null,
  };
  const course = { meta, results: normalizeResults(resResp.data) };
  courseCache.set(editionId, course);
  courseMetaCache.set(editionId, meta);
  return course;
}

async function preloadAllCourseMeta() {
  if (!window.supabaseClient) return;
  const { data, error } = await window.supabaseClient
    .from("editions")
    .select("id, race_id, year, series, races(name, country, distance_km, elevation_gain)")
    .order("id");
  if (error) throw new Error("preloadAllCourseMeta: " + error.message);
  for (const e of data) {
    courseMetaCache.set(e.id, {
      race_id: e.id,
      base_race_id: e.race_id,
      name: e.races?.name || e.id,
      country: e.races?.country || null,
      year: e.year,
      series: e.series || [],
      distance_km: e.races?.distance_km || null,
      elevation_gain: e.races?.elevation_gain || null,
    });
  }
}

// ---- UI state ----
const state = {
  appMode: "public",
  indexSource,
  assetPrefix: "",
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
  // Trends
  trendsRaceId: null,
  trendsGender: "both",
  trendsRciKey: "rc5",
  // Admin state
  itraCookie: "",
  utmbToken: "",
  discoverRaces: [],
  importQueue: [],
  importRunning: false,
  raceSelected: null,
};

// Filter chip state — shared between wirePublicChipFilters and filter bar
const chipState = { activeSeries: new Set(), activeYears: new Set([2025]), activeCountry: "", isManual: false };
// Exposed by wirePublicChipFilters so boot section can wire reset
let _publicFilterReset = () => {};

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

  const emptyEl = document.getElementById("rciEmptyState");
  if (emptyEl) emptyEl.style.display = rows.length === 0 ? "" : "none";

  const allMetrics = rows.flatMap(r => [r.rc3, r.rc5, r.rc10, r.rc20]).filter(Number.isFinite);
  const minVal = allMetrics.length ? Math.min(...allMetrics) : 0;
  const maxVal = allMetrics.length ? Math.max(...allMetrics) : 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td class="col-left" style="font-weight:600;">${r.name}</td>
      <td class="col-left" style="color:var(--muted);">${r.country || "-"}</td>
      <td class="col-left" style="color:var(--muted);">${r.series || "-"}</td>
      <td class="col-extra col-num" style="${densityColor(r.rc3, minVal, maxVal)}">${fmt(r.rc3, 2)}</td>
      <td class="col-num" style="${densityColor(r.rc5, minVal, maxVal)}">${fmt(r.rc5, 2)}</td>
      <td class="col-num" style="${densityColor(r.rc10, minVal, maxVal)}">${fmt(r.rc10, 2)}</td>
      <td class="col-extra col-num" style="${densityColor(r.rc20, minVal, maxVal)}">${fmt(r.rc20, 2)}</td>
    `;
    if (r.base_race_id) {
      tr.title = lang === "fr" ? "Voir les tendances →" : "View trends →";
      tr.addEventListener("click", () => {
        state.trendsRaceId = r.base_race_id;
        setActiveTab("trends");
        renderTrendsRaceList();
        renderTrendsChart();
      });
    }
    tbody.appendChild(tr);
  }

  const sort = state.rciNormSorts[gender];
  for (const th of table.querySelectorAll("thead th[data-key]")) {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.key === sort.key) th.classList.add(sort.dir === "asc" ? "sort-asc" : "sort-desc");
  }
}

function fuzzyMatch(query, text) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  return terms.every(t => lower.includes(t));
}

// Set by wirePublicChipFilters() — called from switchSource() at module level
let refreshPublicChips = null;

function wirePublicChipFilters() {
  // chipState is module-level (defined after state object)

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

    // Group editions by base_race_id
    const groups = new Map();
    for (const c of getManifestEntries()) {
      const id = c.race_id;
      const meta = getCourseMeta(id) || {};
      const name = meta.name || id;
      if (q && !fuzzyMatch(q, name) && !fuzzyMatch(q, id)) continue;
      if (chipState.activeCountry && meta.country !== chipState.activeCountry) continue;
      const baseId = meta.base_race_id || id;
      if (!groups.has(baseId)) {
        groups.set(baseId, { name, country: meta.country, distance_km: meta.distance_km, editions: [] });
      }
      groups.get(baseId).editions.push({ id, year: meta.year });
    }
    for (const g of groups.values()) g.editions.sort((a, b) => (b.year || 0) - (a.year || 0));

    for (const [, group] of [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const editionIds = group.editions.map(e => e.id);
      const selectedCount = editionIds.filter(id => state.rciNormSelected.has(id)).length;

      const item = document.createElement("div");
      item.style.cssText = "padding:7px 8px; border-radius:10px; background:#fff; margin-bottom:4px;";

      // Race header row with checkbox
      const header = document.createElement("div");
      header.style.cssText = "display:flex; align-items:center; gap:8px; font-size:12px;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedCount === editionIds.length;
      cb.indeterminate = selectedCount > 0 && selectedCount < editionIds.length;
      cb.addEventListener("change", () => {
        chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.isManual = true;
        editionIds.forEach(id => cb.checked ? state.rciNormSelected.add(id) : state.rciNormSelected.delete(id));
        renderSeriesChips(); renderYearChips(); updateCountBadge(); triggerUpdate();
        renderPublicRaceList();
      });
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "flex:1; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      nameSpan.textContent = group.name;
      const metaSpan = document.createElement("span");
      metaSpan.style.cssText = "font-size:11px; color:var(--muted); white-space:nowrap; flex-shrink:0;";
      metaSpan.textContent = [group.country, group.distance_km ? `${group.distance_km} km` : null].filter(Boolean).join(" · ");
      header.appendChild(cb); header.appendChild(nameSpan); header.appendChild(metaSpan);

      // Year chips row
      const yearsRow = document.createElement("div");
      yearsRow.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; padding-left:22px;";
      for (const ed of group.editions) {
        const btn = document.createElement("button");
        btn.className = "chip" + (state.rciNormSelected.has(ed.id) ? " active" : "");
        btn.style.cssText = "padding:2px 9px; font-size:11px;";
        btn.textContent = ed.year || ed.id;
        btn.addEventListener("click", () => {
          chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.isManual = true;
          if (state.rciNormSelected.has(ed.id)) state.rciNormSelected.delete(ed.id);
          else state.rciNormSelected.add(ed.id);
          renderSeriesChips(); renderYearChips(); updateCountBadge(); triggerUpdate();
          renderPublicRaceList();
        });
        yearsRow.appendChild(btn);
      }

      item.appendChild(header); item.appendChild(yearsRow);
      list.appendChild(item);
    }
    updateCountBadge();
  }

  function renderFilterBar() {
    const n = state.rciNormSelected.size;
    const countEl = document.getElementById("filterBarCount");
    if (countEl) countEl.textContent = String(n);
    const clearBtn = document.getElementById("clearSelectionBtn");
    if (clearBtn) clearBtn.style.display = n > 0 ? "" : "none";
  }

  function updateCountBadge() {
    const el = document.getElementById("publicRaceCount");
    if (el) el.textContent = String(state.rciNormSelected.size);
    renderFilterBar();
  }

  async function triggerUpdate() {
    renderFilterBar();
    await renderPublicRciTable();
    if (state.activeTab === "visualization") await updateVisualization();
    if (state.activeTab === "charts") await updateCharts();
  }

  // publicRaceSearch is now always visible inside the picker modal — no toggle needed
  const raceSearchEl = document.getElementById("publicRaceSearch");
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
  renderFilterBar();

  _publicFilterReset = () => {
    chipState.activeSeries.clear(); chipState.activeYears.clear();
    chipState.activeCountry = ""; chipState.isManual = false;
    state.rciNormFilters.country = "";
    setSelectionByYear(state.rciNormSelected, 2025);
    renderSeriesChips(); renderYearChips(); renderCountryChips(); renderPublicRaceList(); renderFilterBar(); triggerUpdate();
  };

  // Expose for switchSource() which lives at module level
  refreshPublicChips = () => {
    renderSeriesChips();
    renderYearChips();
    renderCountryChips();
    renderPublicRaceList();
    renderFilterBar();
  };
}

// ---- Picker modal ----
function openPicker() {
  const el = document.getElementById("pickerOverlay");
  if (el) el.hidden = false;
}
function closePicker() {
  const el = document.getElementById("pickerOverlay");
  if (el) el.hidden = true;
}

// ---- Trends tab ----
function renderTrendsRaceList() {
  const list = document.getElementById("trendsRaceList");
  if (!list) return;
  const q = (document.getElementById("trendsRaceSearch")?.value || "").trim().toLowerCase();
  const races = new Map();
  for (const [, meta] of courseMetaCache) {
    if (!meta.base_race_id) continue;
    const name = meta.name || meta.base_race_id;
    if (q && !name.toLowerCase().includes(q) && !meta.base_race_id.toLowerCase().includes(q)) continue;
    if (!races.has(meta.base_race_id)) races.set(meta.base_race_id, { name, years: [] });
    if (meta.year) races.get(meta.base_race_id).years.push(meta.year);
  }
  list.innerHTML = "";
  for (const [raceId, info] of [...races.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    info.years.sort((a, b) => a - b);
    const yearsLabel = info.years.length > 1
      ? `${info.years[0]}–${info.years[info.years.length - 1]}`
      : (info.years[0] ? String(info.years[0]) : "");
    const item = document.createElement("div");
    item.className = "race-item" + (state.trendsRaceId === raceId ? " selected" : "");
    const nameEl = document.createElement("div");
    nameEl.className = "race-item-name";
    nameEl.textContent = info.name;
    const yearsEl = document.createElement("span");
    yearsEl.className = "race-item-years";
    yearsEl.textContent = yearsLabel;
    item.appendChild(nameEl); item.appendChild(yearsEl);
    item.addEventListener("click", () => {
      state.trendsRaceId = raceId;
      renderTrendsRaceList();
      renderTrendsChart();
    });
    list.appendChild(item);
  }
}

async function renderTrendsChart() {
  const raceId = state.trendsRaceId;
  const emptyEl = document.getElementById("trendsEmpty");
  const detailEl = document.getElementById("trendsDetail");
  if (!raceId) {
    if (emptyEl) emptyEl.style.display = "";
    if (detailEl) detailEl.style.display = "none";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  if (detailEl) detailEl.style.display = "";

  const editionIds = [];
  for (const [edId, meta] of courseMetaCache) {
    if (meta.base_race_id === raceId) editionIds.push(edId);
  }
  editionIds.sort();

  const courses = await Promise.all(editionIds.map(id => loadCourse(id).catch(() => null)));
  const editionData = [];
  for (const course of courses) {
    if (!course) continue;
    const rf = filterResultsByGender(course.results, "female").map(r => ({ ...r, index: normalizeItraFemaleIndex(r.index) }));
    const rm = filterResultsByGender(course.results, "male");
    editionData.push({
      year: course.meta.year,
      rc5f: rciFromResults(rf, 5, false), rc10f: rciFromResults(rf, 10, false),
      rc5m: rciFromResults(rm, 5, false), rc10m: rciFromResults(rm, 10, false),
    });
  }
  editionData.sort((a, b) => a.year - b.year);

  const n = state.trendsRciKey === "rc10" ? 10 : 5;
  const years = editionData.map(d => d.year);
  const yF = editionData.map(d => n === 5 ? d.rc5f : d.rc10f);
  const yM = editionData.map(d => n === 5 ? d.rc5m : d.rc10m);
  const showF = state.trendsGender !== "male";
  const showM = state.trendsGender !== "female";

  const traces = [];
  if (showF) traces.push({ x: years, y: yF, name: t("trendsGenderWomen"), mode: "lines+markers", line: { color: "rgb(75,131,88)", width: 3 }, marker: { size: 7 }, connectgaps: false });
  if (showM) traces.push({ x: years, y: yM, name: t("trendsGenderMen"), mode: "lines+markers", line: { color: "rgb(198,93,38)", width: 3 }, marker: { size: 7 }, connectgaps: false });

  const layout = {
    margin: { l: 50, r: 20, t: 10, b: 40 },
    xaxis: { tickmode: "linear", dtick: 1, fixedrange: true, showgrid: true, gridcolor: "#e9e3d9" },
    yaxis: { title: state.trendsRciKey.toUpperCase(), fixedrange: true, showgrid: true, gridcolor: "#e9e3d9" },
    legend: { orientation: "h", y: 1.16, font: { size: 11 } },
    plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Archivo, sans-serif", size: 12 }
  };
  Plotly.react("trendsPlot", traces, layout, { displayModeBar: false, responsive: true });
  resizePlot("trendsPlot");

  const firstMeta = courseMetaCache.get(editionIds[0]);
  const headerEl = document.getElementById("trendsHeader");
  if (headerEl && firstMeta) {
    const meta = [firstMeta.country, firstMeta.distance_km ? `${firstMeta.distance_km} km` : null].filter(Boolean).join(" · ");
    headerEl.innerHTML = `
      <div style="font-size:15px; font-weight:700;">${firstMeta.name}</div>
      <div style="font-size:12px; color:var(--muted);">${meta}</div>`;
  }

  const tableWrap = document.getElementById("trendsTableWrap");
  if (tableWrap) {
    const fL = t("trendsGenderWomen"); const mL = t("trendsGenderMen"); const yL = t("yearCol");
    const rows = editionData.map(d => `
      <tr>
        <td class="col-left" style="font-family:'IBM Plex Mono',monospace;">${d.year}</td>
        <td class="col-num">${fmt(d.rc5f, 2)}</td><td class="col-num">${fmt(d.rc10f, 2)}</td>
        <td class="col-num">${fmt(d.rc5m, 2)}</td><td class="col-num">${fmt(d.rc10m, 2)}</td>
      </tr>`).join("");
    tableWrap.innerHTML = `<table>
      <thead><tr>
        <th class="col-left">${yL}</th>
        <th>RCI5 ${fL}</th><th>RCI10 ${fL}</th>
        <th>RCI5 ${mL}</th><th>RCI10 ${mL}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
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
      base_race_id: meta.base_race_id || null,
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
    const hasLoginHint = doc.querySelector('input[type="password"], form[action*="login"], [href*="login"]');
    const pageTitle = doc.querySelector("title")?.textContent?.trim() || "(no title)";
    console.warn("[import] #RunnerRaceResults not found on:", url, "| page title:", pageTitle, "| login hint:", !!hasLoginHint);
    if (hasLoginHint) throw new Error(`Cookie expired — re-paste a fresh cookie from itra.run.\nURL: ${url}`);
    throw new Error(`Results table (#RunnerRaceResults) not found.\nURL: ${url}\nPage title: "${pageTitle}"\nPossible causes: edition cancelled, no published results, or ITRA page structure changed.`);
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

// ---- Admin: slug + URL utilities ----
function slugToId(itraSlug) {
  // "42km.du.Mont.Blanc" → "42km-du-mont-blanc"
  return itraSlug.replace(/\./g, "-").toLowerCase();
}

function itraUrlParts(url) {
  const m = url.match(/\/Races\/RaceResults\/([^/]+)\/(\d{4})\/(\d+)/);
  if (!m) return null;
  return { slug: m[1], year: parseInt(m[2], 10), itraId: m[3] };
}

// ---- Admin: cookie ----
function saveCookie() {
  const val = (document.getElementById("itraCookieInput")?.value || "").trim();
  state.itraCookie = val;
  const statusEl = document.getElementById("cookieStatus");
  if (statusEl) statusEl.textContent = val ? "Cookie saved ✓" : "Not set";
}

// ---- Admin: discover ----
function setDiscoverStatus(msg, type = "") {
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

async function discoverSearch() {
  const countriesRaw = document.getElementById("discoverCountry")?.value || "";
  const countries = countriesRaw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const dateStart = document.getElementById("discoverDateStart")?.value;
  const dateEnd = document.getElementById("discoverDateEnd")?.value;
  const minKm = parseFloat(document.getElementById("discoverMinKm")?.value) || 0;
  const maxKm = parseFloat(document.getElementById("discoverMaxKm")?.value) || null;

  if (!countries.length) { setDiscoverStatus("Enter at least one country code (e.g. FR).", "error"); return; }
  if (!dateStart || !dateEnd) { setDiscoverStatus("Set both From and To dates.", "error"); return; }

  setDiscoverStatus("Searching itra.run…");
  const btn = document.getElementById("discoverSearchBtn");
  if (btn) btn.disabled = true;
  document.getElementById("discoverResultsPanel").style.display = "none";
  document.getElementById("editionPickerPanel").style.display = "none";

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
    if (countEl) countEl.textContent = String(races.length);

    if (races.length) {
      setDiscoverStatus(`Found ${races.length} races with published results.`, "");
      document.getElementById("discoverResultsPanel").style.display = "";
    } else {
      setDiscoverStatus("No races found matching your filters.", "error");
    }
  } catch (err) {
    setDiscoverStatus("Error: " + err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderDiscoverResults() {
  const tbody = document.getElementById("discoverTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of state.discoverRaces) {
    const tr = document.createElement("tr");
    const nameCell = r.name || "";
    tr.innerHTML = `
      <td>${r.country || ""}</td>
      <td style="font-weight:600;">${nameCell}</td>
      <td style="text-align:right;">${r.km ?? ""}</td>
      <td style="text-align:right;">${r.elevation ?? ""}</td>
      <td><button class="chip-sm add-editions-btn">+ Editions</button></td>
    `;
    const addBtn = tr.querySelector(".add-editions-btn");
    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      addBtn.textContent = "Loading…";
      try {
        if (!state.itraCookie) throw new Error("Set the ITRA cookie first (top of page).");
        const resp = await fetch("/api/itra-race-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: r.url, cookieHeader: state.itraCookie })
        });
        const info = await resp.json();
        if (!resp.ok) throw new Error(info.error || `HTTP ${resp.status}`);
        renderEditionPicker(info, r);
      } catch (err) {
        addBtn.disabled = false;
        addBtn.textContent = "+ Editions";
        setDiscoverStatus("Error: " + err.message, "error");
      }
    });
    tbody.appendChild(tr);
  }
}

// ---- Admin: edition picker ----
function renderEditionPicker(info, sourceRow) {
  const panel = document.getElementById("editionPickerPanel");
  if (!panel) return;

  document.getElementById("pickerEventName").textContent = info.eventName || "";
  document.getElementById("pickerRaceName").textContent = info.raceName || info.slug || "";

  const raceId = slugToId(info.slug);

  const otherDistances = info.siblings.filter(s => !s.isCurrent && !s.isCancelled);

  const body = document.getElementById("pickerBody");
  body.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:14px;">
      <div>
        <span class="filter-label">Editions to import</span>
        <div id="editionCheckboxes" style="display:flex; flex-direction:column; gap:3px; margin-top:6px;">
          ${info.editions.map((e, i) => `
            <label class="edition-row">
              <input type="checkbox" name="edition" value="${e.itraId}" data-year="${e.year}" data-url="${e.url}" ${i < 3 ? "checked" : ""} style="width:auto;" />
              <span>${e.year}</span>
            </label>
          `).join("")}
        </div>
        ${info.editions.length === 0 ? '<div class="note">No edition history found.</div>' : ""}
      </div>
      <div>
        <span class="filter-label">Series tags</span>
        <input id="pickerSeries" type="text" placeholder="utmb-world-series, gtws…" style="margin-top:6px; margin-bottom:4px;" />
        <div class="note">Comma-separated. Applied to all selected editions.</div>
        ${otherDistances.length ? `
          <span class="filter-label" style="margin-top:14px;">Other distances in event</span>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">
            ${otherDistances.map(s => `
              <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
                <span style="flex:1;">${s.name}</span>
                <button class="chip-sm" data-sibling-url="${s.url}" data-sibling-name="${s.name.replace(/"/g,"&quot;")}">+ Add</button>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <button id="addToQueueBtn" class="chip active">Add to Queue</button>
      <span id="pickerStatus" style="font-size:12px; color:var(--muted);"></span>
    </div>
  `;

  // Store context on panel for queue button handler
  panel.dataset.raceId = raceId;
  panel.dataset.raceName = info.raceName || "";
  panel.dataset.slug = info.slug;
  panel.dataset.country = sourceRow?.country || "";
  panel.dataset.km = sourceRow?.km ?? "";
  panel.dataset.elevation = sourceRow?.elevation ?? "";

  document.getElementById("addToQueueBtn").addEventListener("click", addSelectedToQueue);

  // Sibling "Add" buttons — inject into discover results and go back
  body.querySelectorAll("[data-sibling-url]").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.siblingUrl;
      const name = btn.dataset.siblingName;
      if (!state.discoverRaces.find(r => r.url === url)) {
        state.discoverRaces.unshift({ name, country: sourceRow?.country || "", km: null, elevation: null, url });
      }
      panel.style.display = "none";
      renderDiscoverResults();
      document.getElementById("discoverResultsPanel").style.display = "";
    });
  });

  document.getElementById("discoverResultsPanel").style.display = "none";
  panel.style.display = "";
}

async function addSelectedToQueue() {
  const panel = document.getElementById("editionPickerPanel");
  const raceId = panel.dataset.raceId;
  const raceName = panel.dataset.raceName;
  const slug = panel.dataset.slug;
  const country = panel.dataset.country || null;
  const km = panel.dataset.km ? parseFloat(panel.dataset.km) : null;
  const elevation = panel.dataset.elevation ? parseInt(panel.dataset.elevation, 10) : null;
  const seriesRaw = (document.getElementById("pickerSeries")?.value || "").trim();
  const series = seriesRaw ? seriesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

  const checked = [...document.querySelectorAll("#editionCheckboxes input[name='edition']:checked")];
  const pickerStatus = document.getElementById("pickerStatus");
  if (!checked.length) {
    if (pickerStatus) pickerStatus.textContent = "Select at least one edition.";
    return;
  }

  let added = 0;
  const warnings = [];
  for (const cb of checked) {
    const year = parseInt(cb.dataset.year, 10);
    const url = cb.dataset.url;
    const editionId = `${raceId}-${year}`;
    if (state.importQueue.find(j => j.editionId === editionId)) continue;

    // Detect shared itraId across different race slugs (ITRA uses one result set per event weekend)
    const itraId = url.match(/\/(\d+)$/)?.[1] || null;
    const queueConflict = itraId
      ? state.importQueue.find(j => j.itraId === itraId && j.year === year)
      : null;

    // Also check DB for same itraId already imported
    let dbConflict = null;
    if (itraId && window.supabaseClient) {
      const { data } = await window.supabaseClient
        .from("editions")
        .select("id, race_id")
        .ilike("itra_edition_url", `%/${itraId}`)
        .neq("id", editionId)
        .limit(1);
      dbConflict = data?.[0] || null;
    }

    let warning = null;
    if (queueConflict || dbConflict) {
      const conflictName = queueConflict
        ? `"${queueConflict.raceName} ${year}" in queue`
        : `"${dbConflict.id}" in DB`;
      warning = `⚠ itraId ${itraId} shared with ${conflictName} — data may be combined event results`;
      warnings.push(`${raceName} ${year}: ${warning}`);
    }

    state.importQueue.push({ editionId, raceId, raceName, slug, year, country, km, elevation, series, url, itraId, warning, status: "pending", error: null, resultCount: null });
    added++;
  }

  renderQueue();
  const msgs = [];
  if (added) msgs.push(`${added} edition${added > 1 ? "s" : ""} added to queue.`);
  if (warnings.length) msgs.push(...warnings);
  if (pickerStatus) pickerStatus.textContent = msgs.join(" | ") || "Already in queue.";
}

// ---- Admin: import queue ----
function setQueueStatus(msg, type = "") {
  const el = document.getElementById("queueStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (type ? ` ${type}` : "");
  el.style.display = msg ? "" : "none";
}

function renderQueue() {
  const list = document.getElementById("queueList");
  const empty = document.getElementById("queueEmpty");
  const countEl = document.getElementById("queueCount");
  if (!list) return;

  if (countEl) countEl.textContent = String(state.importQueue.length);
  if (empty) empty.style.display = state.importQueue.length ? "none" : "";

  list.innerHTML = "";
  for (const job of state.importQueue) {
    const icon = { pending: "⏳", running: "⟳", done: "✓", error: "✗" }[job.status] || "⏳";
    const cls = { done: "qi-done", error: "qi-error", running: "qi-running" }[job.status] || "";
    const detail = job.status === "done" ? `${job.resultCount} results saved`
      : job.status === "error" ? job.error || "error"
      : "";
    const div = document.createElement("div");
    div.className = `queue-item ${cls}`;
    div.innerHTML = `
      <span class="qi-icon">${icon}</span>
      <div class="qi-body">
        <div class="qi-name">${job.raceName} ${job.year}</div>
        <div class="qi-sub">${job.raceId} · ${job.series.join(", ") || "no series"}${job.itraId ? ` · itraId ${job.itraId}` : ""}</div>
        <div class="qi-sub" style="font-size:10px; word-break:break-all;">
          <a href="${job.url}" target="_blank" rel="noopener" style="color:var(--muted); text-decoration:underline;">${job.url}</a>
        </div>
        ${detail ? `<div class="qi-detail" style="color:${job.status === "error" ? "#ef4444" : "#16a34a"};">${detail}</div>` : ""}
        ${job.warning ? `<div class="qi-detail" style="color:#d97706;">${job.warning}</div>` : ""}
      </div>
    `;
    list.appendChild(div);
  }
}

async function startQueue() {
  if (state.importRunning) return;
  const pending = state.importQueue.filter(j => j.status === "pending" || j.status === "error");
  if (!pending.length) { setQueueStatus("No pending jobs in queue.", ""); return; }
  if (!state.itraCookie) { setQueueStatus("Set the ITRA cookie first.", "error"); return; }

  state.importRunning = true;
  const btn = document.getElementById("startQueueBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Importing…"; }

  let ok = 0, fail = 0;
  for (const job of state.importQueue) {
    if (job.status === "done") continue;
    job.status = "running";
    renderQueue();
    setQueueStatus(`Importing ${ok + fail + 1} / ${pending.length}: ${job.raceName} ${job.year}…`);
    try {
      await importEdition(job);
      job.status = "done";
      ok++;
    } catch (err) {
      job.status = "error";
      job.error = err.message;
      fail++;
    }
    renderQueue();
  }

  state.importRunning = false;
  if (btn) { btn.disabled = false; btn.textContent = "▶ Start Import"; }
  setQueueStatus(`Done — ${ok} imported, ${fail} failed.`, fail === 0 ? "ok" : ok > 0 ? "" : "error");

  if (ok > 0) {
    manifest = null;
    courseCache.clear();
    courseMetaCache.clear();
    await loadManifest();
    renderAdminRaceList(document.getElementById("searchRace")?.value || "");
  }
}

async function importEdition(job) {
  const resp = await fetch("/api/itra-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: job.url, cookieHeader: state.itraCookie })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `Proxy ${resp.status}`);
  }
  const html = await resp.text();
  const results = parseItraHtml(html, job.url);

  // Duplicate detection: check if top-10 runners match any other already-imported edition
  if (results.length >= 10 && window.supabaseClient) {
    const top10 = results.slice(0, 10).map(r => r.runner).filter(Boolean);
    const { data: existing } = await window.supabaseClient
      .from("results")
      .select("edition_id, runner")
      .in("runner", top10)
      .eq("rank", 1)
      .neq("edition_id", job.editionId)
      .limit(5);
    if (existing && existing.length > 0) {
      const dupEditions = [...new Set(existing.map(r => r.edition_id))];
      job.warning = `⚠ Top results match already-imported edition(s): ${dupEditions.join(", ")} — check URLs`;
    }
  }

  const { count } = await saveEditionToSupabase(job, results);
  job.resultCount = count;
}

async function saveEditionToSupabase(job, results) {
  if (!window.supabaseClient) throw new Error("Supabase not configured.");

  const { error: raceErr } = await window.supabaseClient.from("races").upsert({
    id: job.raceId,
    name: job.raceName,
    country: job.country || null,
    distance_km: job.km || null,
    elevation_gain: job.elevation || null,
    source: "itra",
    itra_race_url: `https://itra.run/Races/RaceResults/${job.slug}`
  }, { onConflict: "id" });
  if (raceErr) throw new Error("Race upsert: " + raceErr.message);

  const { error: edErr } = await window.supabaseClient.from("editions").upsert({
    id: job.editionId,
    race_id: job.raceId,
    year: job.year,
    series: job.series,
    itra_edition_url: job.url
  }, { onConflict: "id" });
  if (edErr) throw new Error("Edition upsert: " + edErr.message);

  const { error: delErr } = await window.supabaseClient.from("results").delete().eq("edition_id", job.editionId);
  if (delErr) throw new Error("Delete results: " + delErr.message);

  const rows = results.map(r => ({
    edition_id: job.editionId, rank: r.rank, gender: r.gender,
    index: r.index, runner: r.runner || null, nationality: r.nationality || null
  }));
  const { error: insErr } = await window.supabaseClient.from("results").insert(rows);
  if (insErr) throw new Error("Insert results: " + insErr.message);

  return { count: rows.length };
}

// ---- Admin: UTMB Discover & Import ----

function utmbTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch { return null; }
}

function updateUtmbTokenStatus() {
  const token = state.utmbToken;
  const el = document.getElementById("utmbTokenStatus");
  if (!el) return;
  if (!token) { el.textContent = "Not set"; el.style.color = ""; return; }
  const exp = utmbTokenExpiry(token);
  if (!exp) { el.textContent = "Set (unknown expiry)"; el.style.color = ""; return; }
  const mins = Math.round((exp - Date.now()) / 60000);
  if (mins <= 0) { el.textContent = "Expired — paste new token"; el.style.color = "#dc2626"; }
  else { el.textContent = `Valid · expires in ${mins} min`; el.style.color = mins < 5 ? "#d97706" : "#16a34a"; }
}

async function utmbApi(path, params = {}) {
  const resp = await fetch("/api/utmb-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, params, token: state.utmbToken || null })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `utmb-proxy ${resp.status}`);
  }
  return resp.json();
}

let utmbSearchState = { grouped: [], selectedIndices: new Set(), filterText: "" };
let utmbDbRaces = [];

const UTMB_NOISE = new Set([
  "world", "series", "dacia", "hoka", "by", "presented", "powered", "official",
  "the", "de", "du", "la", "le", "les", "des", "and", "et",
]);

function normalizeUtmbName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !UTMB_NOISE.has(w))
    .sort();
}

function jaccardSim(a, b) {
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function loadUtmbDbRaces() {
  if (!window.supabaseClient) return;
  const { data } = await window.supabaseClient
    .from("races").select("id, name, country, distance_km").eq("source", "utmb");
  utmbDbRaces = data || [];
}

function findUtmbDbMatch(group) {
  const groupWords = normalizeUtmbName(group.raceName);
  if (!groupWords.length) return null;
  let best = null, bestSim = 0;
  for (const r of utmbDbRaces) {
    if (group.country && r.country && r.country !== group.country) continue;
    const dbNamePart = r.name.includes(" — ") ? r.name.split(" — ")[1] : r.name;
    const sim = jaccardSim(groupWords, normalizeUtmbName(dbNamePart));
    // Skip km check for strong name matches (course distances change across eras)
    if (sim < 0.7 && group.km && r.distance_km && Math.abs(group.km - r.distance_km) > 20) continue;
    if (sim > bestSim) { bestSim = sim; best = r; }
  }
  return bestSim >= 0.35 ? { raceId: best.id, name: best.name } : null;
}

function setUtmbStatus(msg, type = "info") {
  const el = document.getElementById("utmbSearchStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "" : "none";
  el.className = "status " + (type === "error" ? "status-error" : "");
}

function utmbLog(msg, type = "info") {
  const log = document.getElementById("utmbLogEntries");
  const panel = document.getElementById("utmbImportLog");
  if (!log || !panel) return;
  panel.style.display = "";
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.color = type === "error" ? "#dc2626" : type === "ok" ? "#16a34a" : "#374151";
  log.appendChild(div);
  div.scrollIntoView({ block: "nearest" });
}

function utmbBuildParams(offset = 0) {
  const search = document.getElementById("utmbSearch")?.value.trim() || "";
  const country = document.getElementById("utmbCountry")?.value.trim().toUpperCase() || "";
  const dateStart = document.getElementById("utmbDateStart")?.value || "";
  const dateEnd = document.getElementById("utmbDateEnd")?.value || "";
  const params = { lang: "en", limit: utmbSearchState.limit, offset };
  if (search) params.search = search;
  if (country) params.countryCodes = country;
  if (dateStart) params.dateMin = dateStart;
  if (dateEnd) params.dateMax = dateEnd;
  return params;
}

function utmbGroupRaces(races) {
  // Step 1: exact grouping by eventName|raceName
  const map = new Map();
  for (const r of races) {
    const key = (r.eventName || "") + "|" + (r.name || "");
    if (!map.has(key)) {
      map.set(key, {
        eventName: r.eventName || "",
        raceName: r.name || "",
        category: r.category || "",
        country: r.startCountry || "",
        km: r.distance ? parseFloat(r.distance) : null,
        elevation: r.elevationGain || null,
        editions: []
      });
    }
    map.get(key).editions.push({
      year: r.year,
      uri: r.uriResults || "",
      hasResults: r.hasResults,
    });
  }
  for (const g of map.values()) g.editions.sort((a, b) => b.year - a.year);

  // Step 2: merge groups that differ only by sponsor name
  // Compare raceName only (the stable sub-race field, e.g. "CCC"), not eventName
  // (eventName changes with sponsors and contains "UTMB" for almost all races)
  const groups = [...map.values()];
  const merged = new Set();
  const result = [];
  for (let i = 0; i < groups.length; i++) {
    if (merged.has(i)) continue;
    const g = { ...groups[i], editions: [...groups[i].editions] };
    const wi = normalizeUtmbName(g.raceName);
    if (!wi.length) { result.push(g); continue; }
    for (let j = i + 1; j < groups.length; j++) {
      if (merged.has(j)) continue;
      const h = groups[j];
      if (g.country && h.country && g.country !== h.country) continue;
      const wj = normalizeUtmbName(h.raceName);
      const sim = jaccardSim(wi, wj);
      if (sim < 0.5) continue;
      // Skip km check for strong name matches (course distances change across eras)
      if (sim < 0.8 && g.km && h.km && Math.abs(g.km - h.km) > 20) continue;
      g.editions = [...g.editions, ...h.editions].sort((a, b) => b.year - a.year);
      merged.add(j);
    }
    result.push(g);
  }
  return result;
}

async function utmbFetchAll() {
  const limit = 25;
  const first = await utmbApi("search/races-qualifiers", utmbBuildParams(0));
  let races = first.races || [];
  const total = first.nbHits || 0;
  if (total > limit) {
    setUtmbStatus(`Loading… (${races.length} / ${total})`);
    const offsets = [];
    for (let o = limit; o < total; o += limit) offsets.push(o);
    const pages = await Promise.all(offsets.map(o => utmbApi("search/races-qualifiers", utmbBuildParams(o))));
    for (const p of pages) races = races.concat(p.races || []);
  }
  return races;
}

async function utmbSearch() {
  setUtmbStatus("Searching…");
  try {
    const [races] = await Promise.all([utmbFetchAll(), loadUtmbDbRaces()]);
    const groups = utmbGroupRaces(races);
    for (const g of groups) g.dbMatch = findUtmbDbMatch(g);
    utmbSearchState.grouped = groups;
    utmbSearchState.filterText = "";
    const filterEl = document.getElementById("utmbFilter");
    if (filterEl) filterEl.value = "";
    setUtmbStatus("");
    renderUtmbResults();
  } catch (err) {
    setUtmbStatus("Error: " + err.message, "error");
  }
}

function syncUtmbMergeBtn() {
  const btn = document.getElementById("utmbMergeBtn");
  if (!btn) return;
  const n = utmbSearchState.selectedIndices.size;
  btn.style.display = n >= 2 ? "" : "none";
  btn.textContent = n >= 2 ? `Merge selected (${n})` : "Merge selected";
}

function renderUtmbResults() {
  const panel = document.getElementById("utmbResultsPanel");
  const tbody = document.getElementById("utmbTableBody");
  const countEl = document.getElementById("utmbCount");
  if (!panel || !tbody) return;
  const { grouped } = utmbSearchState;
  panel.style.display = grouped.length ? "" : "none";
  document.getElementById("utmbEditionPanel").style.display = "none";
  if (!grouped.length) return;
  utmbSearchState.selectedIndices.clear();
  syncUtmbMergeBtn();
  const q = utmbSearchState.filterText.toLowerCase();
  const visible = q
    ? grouped.filter(g =>
        (g.raceName || "").toLowerCase().includes(q) ||
        (g.eventName || "").toLowerCase().includes(q) ||
        (g.country || "").toLowerCase().includes(q))
    : grouped;
  countEl.textContent = q ? `${visible.length} / ${grouped.length}` : grouped.length;
  tbody.innerHTML = "";
  for (const g of visible) {
    const i = grouped.indexOf(g); // real index for merge
    const withResults = g.editions.filter(e => e.hasResults);
    const matchLabel = g.dbMatch
      ? `<span style="font-size:11px; color:var(--clay);" title="${g.dbMatch.name}">→ ${g.dbMatch.name.includes(" — ") ? g.dbMatch.name.split(" — ")[1] : g.dbMatch.name}</span>`
      : `<span style="font-size:11px; color:var(--muted);">new</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="width:28px; text-align:center;"><input type="checkbox" data-idx="${i}" style="width:auto; margin:0;" /></td>
      <td class="col-left">${g.country || "—"}</td>
      <td class="col-left">
        <div style="font-weight:700; font-size:13px;">${g.eventName}</div>
        <div style="font-size:11px; color:#64748b;">${g.raceName}</div>
      </td>
      <td style="text-align:right;">${g.km ? g.km.toFixed(1) : "—"}</td>
      <td>${g.category || "—"}</td>
      <td style="font-family:monospace; font-size:11px;">${g.editions.map(e => e.year).join(", ")}</td>
      <td>${matchLabel}</td>
      <td>
        <button class="chip-sm${withResults.length ? " active" : ""}" ${withResults.length ? "" : "disabled"}>
          ${withResults.length ? "+ Editions" : "No results"}
        </button>
      </td>`;
    tr.querySelector("input[type=checkbox]").addEventListener("change", e => {
      if (e.target.checked) utmbSearchState.selectedIndices.add(i);
      else utmbSearchState.selectedIndices.delete(i);
      syncUtmbMergeBtn();
    });
    const btn = tr.querySelector("button");
    if (withResults.length) {
      btn.addEventListener("click", () => renderUtmbEditionPicker(g));
    }
    tbody.appendChild(tr);
  }
}

function mergeSelectedUtmbGroups() {
  const indices = [...utmbSearchState.selectedIndices].sort((a, b) => a - b);
  if (indices.length < 2) return;
  const grouped = utmbSearchState.grouped;
  const canonical = grouped[indices[0]];
  for (let k = 1; k < indices.length; k++) {
    const other = grouped[indices[k]];
    canonical.editions = [...canonical.editions, ...other.editions]
      .sort((a, b) => b.year - a.year);
    // Keep the DB match from whichever group had one
    if (!canonical.dbMatch && other.dbMatch) canonical.dbMatch = other.dbMatch;
  }
  // Remove merged rows (highest indices first to avoid shifting)
  for (let k = indices.length - 1; k >= 1; k--) {
    grouped.splice(indices[k], 1);
  }
  utmbSearchState.selectedIndices.clear();
  renderUtmbResults();
}


function renderUtmbEditionPicker(group) {
  document.getElementById("utmbResultsPanel").style.display = "none";
  const panel = document.getElementById("utmbEditionPanel");
  document.getElementById("utmbPickerEventName").textContent = group.eventName;
  document.getElementById("utmbPickerRaceName").textContent = group.raceName;

  const withResults = group.editions.filter(e => e.hasResults);
  const body = document.getElementById("utmbPickerBody");
  const matchBanner = group.dbMatch
    ? `<div style="font-size:12px; color:var(--clay); background:var(--clay-tint); border-radius:6px; padding:6px 10px; margin-bottom:12px;">
        → Will link to existing race: <strong>${group.dbMatch.name}</strong>
       </div>`
    : "";
  body.innerHTML = `
    ${matchBanner}
    <div style="margin-bottom:14px;">
      <span class="filter-label">Editions to import</span>
      <div id="utmbEditionCheckboxes" style="display:flex; flex-direction:column; gap:3px; margin-top:6px;">
        ${withResults.map((e, i) => `
          <label class="edition-row">
            <input type="checkbox" name="utmb-edition" value="${e.uri}" data-year="${e.year}" ${i < 3 ? "checked" : ""} style="width:auto;" />
            <span>${e.year}</span>
          </label>
        `).join("")}
      </div>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <button id="utmbImportSelectedBtn" class="chip active">Import selected</button>
      <span id="utmbPickerStatus" style="font-size:12px; color:var(--muted);"></span>
    </div>`;

  document.getElementById("utmbImportSelectedBtn").addEventListener("click", () => importUtmbSelected(group));
  panel.style.display = "";
}

async function importUtmbSelected(group) {
  const checked = [...document.querySelectorAll("#utmbEditionCheckboxes input[name='utmb-edition']:checked")];
  const statusEl = document.getElementById("utmbPickerStatus");
  if (!checked.length) { if (statusEl) statusEl.textContent = "Select at least one edition."; return; }

  // Single canonical race_id for all editions in this group.
  // If the group was merged or matched to an existing DB race, use that id.
  // Otherwise anchor to the first checked edition's URI base so that editions
  // from different UTMB numeric IDs (sponsor changes) all land under one race.
  const firstUriBase = checked[0].value.replace(/\.\d{4}$/, "");
  const canonicalRaceId = group.dbMatch?.raceId || ("utmb-" + firstUriBase.replace(/\./g, "-"));

  const btn = document.getElementById("utmbImportSelectedBtn");
  btn.disabled = true;
  let done = 0, failed = 0;
  for (const cb of checked) {
    if (statusEl) statusEl.textContent = `Importing ${cb.dataset.year}…`;
    try {
      await importUtmbEdition({
        uri: cb.value,
        eventName: group.eventName,
        raceName: group.raceName,
        year: parseInt(cb.dataset.year),
        country: group.country,
        km: group.km,
        elevation: group.elevation,
        overrideRaceId: canonicalRaceId,
      });
      cb.parentElement.style.opacity = "0.5";
      done++;
    } catch (err) {
      utmbLog(`✗ ${cb.value}: ${err.message}`, "error");
      failed++;
    }
  }
  if (statusEl) statusEl.textContent = `${done} imported${failed ? `, ${failed} failed` : ""}.`;
  btn.disabled = false;
}

async function importUtmbEdition({ uri, eventName, raceName, year, country, km, elevation, overrideRaceId }) {
  if (!state.utmbToken) throw new Error("Set UTMB token first.");
  const exp = utmbTokenExpiry(state.utmbToken);
  if (exp && exp <= new Date()) throw new Error("Token expired — paste a new one.");

  utmbLog(`↓ Importing ${uri}…`);

  // Fetch top 50 men and top 50 women
  const [menData, womenData] = await Promise.all([
    utmbApi(`races/${uri}/results`, { lang: "en", limit: 50, offset: 0, gender: "H" }),
    utmbApi(`races/${uri}/results`, { lang: "en", limit: 50, offset: 0, gender: "F" }),
  ]);

  if (!menData.isLogged && !womenData.isLogged) {
    throw new Error("Token rejected by UTMB — isLogged=false. Paste a fresh token.");
  }

  const results = [
    ...(menData.results || []).map(r => ({ rank: r.rank, gender: "M", index: r.index, runner: r.fullname, nationality: r.nationalityCode })),
    ...(womenData.results || []).map(r => ({ rank: r.rank, gender: "F", index: r.index, runner: r.fullname, nationality: r.nationalityCode })),
  ].filter(r => r.index !== null && r.index !== undefined);

  if (!results.length) throw new Error("No index scores returned — race may not be fully indexed yet.");

  // Derive stable IDs from the URI base (without year), or use override if matched to existing
  const uriBase = uri.replace(/\.\d{4}$/, "");
  const raceId = overrideRaceId || ("utmb-" + uriBase.replace(/\./g, "-"));
  const editionId = "utmb-" + uri.replace(/\./g, "-");

  if (!window.supabaseClient) throw new Error("Supabase not configured.");

  const { error: raceErr } = await window.supabaseClient.from("races").upsert({
    id: raceId,
    name: eventName + (raceName && raceName !== eventName ? ` — ${raceName}` : ""),
    country: country || null,
    distance_km: km || null,
    elevation_gain: elevation || null,
    source: "utmb",
  }, { onConflict: "id" });
  if (raceErr) throw new Error("Race upsert: " + raceErr.message);

  const { error: edErr } = await window.supabaseClient.from("editions").upsert({
    id: editionId,
    race_id: raceId,
    year,
    utmb_uri: uri,
  }, { onConflict: "id" });
  if (edErr) throw new Error("Edition upsert: " + edErr.message);

  await window.supabaseClient.from("results").delete().eq("edition_id", editionId);

  const rows = results.map(r => ({
    edition_id: editionId, rank: r.rank, gender: r.gender,
    index: r.index, runner: r.runner || null, nationality: r.nationality || null
  }));
  const { error: insErr } = await window.supabaseClient.from("results").insert(rows);
  if (insErr) throw new Error("Insert results: " + insErr.message);

  utmbLog(`✓ ${uri} — ${rows.length} results (${results.filter(r=>r.gender==="M").length}M / ${results.filter(r=>r.gender==="F").length}F)`, "ok");
  updateUtmbTokenStatus();
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
          race_name: getCourseLabel(course),
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
    marker: { color: rows.map(r => r.delta >= 0 ? "rgb(75,131,88)" : "rgb(198,93,38)") },
    hovertemplate: "<b>%{y}</b><br>RCI_F − RCI_M = %{x:.2f}<extra></extra>"
  }], {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    showlegend: false,
    margin: { l: 10, r: 40, t: 10, b: 50 },
    font: { family: "Archivo, sans-serif", size: 12 },
    xaxis: {
      title: `RCI${n} — féminin moins masculin`,
      zeroline: true, zerolinecolor: "#c9c2b8", zerolinewidth: 1.5,
      gridcolor: "#e9e3d9"
    },
    yaxis: { automargin: true, tickfont: { size: 11 } }
  }, { responsive: true, displayModeBar: false });
  resizePlot("vizParityPlot");
}

async function updateVisualization() {
  const vizEl = document.getElementById("vizCount");
  if (vizEl) vizEl.textContent = String(state.vizSelected.size);
  await renderParityVisualization();
}

// ---- Charts: rank curve (depth) ----
function getCourseLabel(course) {
  const name = course.meta?.name || course.meta?.race_id || course.race_id;
  const year = course.meta?.year;
  return year ? `${name} ${year}` : name;
}

function groupForCharts(courses, topN, gender = "both") {
  const grouped = new Map();
  for (const c of courses) {
    const id = c.meta?.race_id || c.race_id;
    let results = (c.results || []).filter(r => r.rank >= 1);
    if (gender !== "both") {
      results = filterResultsByGender(results, gender)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, topN)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    } else {
      results = results.filter(r => r.rank <= topN).sort((a, b) => a.rank - b.rank);
    }
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
      mode: "lines",
      name: label,
      hovertemplate: `<b>${label}</b><br>Rank %{x} — Index %{y:.0f}<extra></extra>`,
      line: { width: 2 }
    };
  });

  const mobile = window.innerWidth < 720;
  Plotly.react("plot", traces, {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: mobile ? { l: 45, r: 10, t: 10, b: 50 } : { l: 55, r: 160, t: 10, b: 50 },
    font: { family: "Archivo, sans-serif", size: 12 },
    xaxis: { title: "Rank", range: [1, topN], gridcolor: "#e9e3d9", zeroline: false, tickfont: { size: 10 } },
    yaxis: { title: "Index", gridcolor: "#e9e3d9", zeroline: false, tickfont: { size: 10 } },
    showlegend: !mobile,
    legend: { orientation: "v", x: 1.02, y: 1, xanchor: "left", font: { size: 10 }, bgcolor: "rgba(255,255,255,0.85)", bordercolor: "#e2e8f0", borderwidth: 1 },
    hovermode: "closest"
  }, { responsive: true, displayModeBar: false });
  resizePlot("plot");
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

// ---- Admin: Races tab ----
function renderMetaCard(key, value) {
  const safe = value === null || value === undefined || value === "" ? "-" : String(value);
  return `<div class="metaCard"><div class="k">${key}</div><div class="v">${safe}</div></div>`;
}

function renderAdminRaceList(searchQuery) {
  const list = document.getElementById("raceList");
  if (!list) return;
  const q = (searchQuery || "").trim().toLowerCase();
  list.innerHTML = "";
  const entries = getManifestEntries();
  if (!entries.length) {
    list.innerHTML = '<div class="note" style="padding:8px;">No editions imported yet.</div>';
    return;
  }
  for (const c of entries) {
    const id = c.race_id;
    const meta = getCourseMeta(id) || {};
    const name = (meta.name || "").toLowerCase();
    if (q && !id.toLowerCase().includes(q) && !name.includes(q)) continue;
    const row = document.createElement("div");
    row.className = "item";
    if (state.raceSelected === id) row.style.background = "rgba(34,51,199,0.08)";
    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = meta.name ? `${meta.name} (${meta.year || "?"})` : id;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = String(meta.year || "-");
    row.appendChild(label);
    row.appendChild(pill);
    row.addEventListener("click", () => { state.raceSelected = id; renderAdminRaceList(q); renderAdminRaceDetail(id); });
    list.appendChild(row);
  }
}

async function renderAdminRaceDetail(editionId) {
  const detail = document.getElementById("raceDetail");
  if (!detail) return;
  detail.innerHTML = '<div class="note">Loading…</div>';
  try {
    const course = await loadCourse(editionId);
    const meta = course.meta || {};
    const series = normalizeSeries(meta.series).join(", ");
    detail.innerHTML = `
      <div class="metaGrid">
        ${renderMetaCard("Edition ID", editionId)}
        ${renderMetaCard("Base race", meta.base_race_id || "-")}
        ${renderMetaCard("Name", meta.name || "-")}
        ${renderMetaCard("Year", meta.year || "-")}
        ${renderMetaCard("Country", meta.country || "-")}
        ${renderMetaCard("Distance (km)", meta.distance_km ?? "-")}
        ${renderMetaCard("Series", series || "-")}
      </div>
      <div class="tableWrap" style="max-height:480px;">
        <table>
          <thead><tr><th>#</th><th>Runner</th><th>Index</th><th>Gender</th><th>Nat.</th></tr></thead>
          <tbody>
            ${(course.results || []).map(r =>
              `<tr><td>${r.rank}</td><td>${r.runner ?? "-"}</td><td>${fmt(r.index, 1)}</td><td>${r.gender ?? "-"}</td><td>${r.nationality ?? "-"}</td></tr>`
            ).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    detail.innerHTML = `<div class="status error">${err.message}</div>`;
  }
}

// ---- Page switching ----
function renderSourceToggle() {
  document.querySelectorAll(".btn-source").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.s === state.indexSource);
  });
}

async function switchSource(newSource) {
  if (newSource === state.indexSource) return;
  state.indexSource = newSource;
  indexSource = newSource;
  localStorage.setItem("trail-index-source", newSource);
  state.rciNormSelected.clear();
  chipState.activeSeries.clear();
  chipState.activeYears.clear();
  chipState.activeCountry = "";
  chipState.isManual = false;
  state.trendsRaceId = null;
  courseCache.clear();
  await loadManifest();
  renderSourceToggle();
  refreshPublicChips?.();
  await triggerUpdate();
}

function resizePlot(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el && el.children.length) Plotly.Plots.resize(el);
  });
}

function setActiveTab(tab) {
  const safeTab = getSafeTab(state.appMode, tab);
  state.activeTab = safeTab;

  const pageMap = {
    rcinormcharts: "pageRciNorm",
    trends: "pageTrends",
    visualization: "pageViz",
    charts: "pageCharts",
    import: "pageImport",
    utmb: "pageUtmb",
    races: "pageRaces"
  };
  for (const [key, id] of Object.entries(pageMap)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === safeTab);
  }

  document.getElementById("tabRciNorm")?.classList.toggle("active", safeTab === "rcinormcharts");
  document.getElementById("tabTrends")?.classList.toggle("active", safeTab === "trends");
  document.getElementById("vizTabParity")?.classList.toggle("active", safeTab === "visualization");
  document.getElementById("tabCharts")?.classList.toggle("active", safeTab === "charts");
  document.getElementById("tabImport")?.classList.toggle("active", safeTab === "import");
  document.getElementById("tabUtmb")?.classList.toggle("active", safeTab === "utmb");
  document.getElementById("tabRaces")?.classList.toggle("active", safeTab === "races");

  if (safeTab === "trends") { renderTrendsRaceList(); renderTrendsChart(); }
  if (safeTab === "visualization") updateVisualization();
  if (safeTab === "charts") updateCharts();
  if (safeTab === "races") renderAdminRaceList(document.getElementById("searchRace")?.value || "");
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

  if (state.appMode === "public") {
    setSelectionByYear(state.rciNormSelected, 2025);
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

    document.querySelectorAll("#parityNChips [data-n]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.parityN = Number(btn.dataset.n);
        document.querySelectorAll("#parityNChips [data-n]").forEach(b =>
          b.classList.toggle("active", Number(b.dataset.n) === state.parityN));
        updateVisualization();
      });
    });

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

    // Filter picker modal
    document.getElementById("openPickerBtn")?.addEventListener("click", openPicker);
    document.getElementById("openPickerBtnEmpty")?.addEventListener("click", openPicker);
    document.getElementById("clearSelectionBtn")?.addEventListener("click", () => {
      state.rciNormSelected.clear();
      chipState.activeSeries.clear(); chipState.activeYears.clear(); chipState.activeCountry = ""; chipState.isManual = false;
      renderSeriesChips(); renderYearChips(); renderCountryChips(); renderPublicRaceList();
      renderFilterBar(); triggerUpdate();
    });
    document.getElementById("closePickerBtn")?.addEventListener("click", closePicker);
    document.getElementById("pickerOverlay")?.addEventListener("click", e => {
      if (e.target.id === "pickerOverlay") closePicker();
    });
    document.getElementById("resetPickerBtn")?.addEventListener("click", () => _publicFilterReset());

    // Trends tab
    document.getElementById("trendsRaceSearch")?.addEventListener("input", renderTrendsRaceList);
    const setTrendsGender = g => {
      state.trendsGender = g;
      document.getElementById("trendsGenderBoth")?.classList.toggle("active", g === "both");
      document.getElementById("trendsGenderWomen")?.classList.toggle("active", g === "female");
      document.getElementById("trendsGenderMen")?.classList.toggle("active", g === "male");
      renderTrendsChart();
    };
    document.getElementById("trendsGenderBoth")?.addEventListener("click", () => setTrendsGender("both"));
    document.getElementById("trendsGenderWomen")?.addEventListener("click", () => setTrendsGender("female"));
    document.getElementById("trendsGenderMen")?.addEventListener("click", () => setTrendsGender("male"));
    document.getElementById("trendsRciRci5")?.addEventListener("click", () => {
      state.trendsRciKey = "rc5";
      document.getElementById("trendsRciRci5")?.classList.add("active");
      document.getElementById("trendsRciRci10")?.classList.remove("active");
      renderTrendsChart();
    });
    document.getElementById("trendsRciRci10")?.addEventListener("click", () => {
      state.trendsRciKey = "rc10";
      document.getElementById("trendsRciRci10")?.classList.add("active");
      document.getElementById("trendsRciRci5")?.classList.remove("active");
      renderTrendsChart();
    });
    renderTrendsRaceList();
  }

  if (state.appMode === "admin") {
    // Cookie
    document.getElementById("saveCookieBtn")?.addEventListener("click", saveCookie);

    // UTMB token
    document.getElementById("utmbSaveTokenBtn")?.addEventListener("click", () => {
      const raw = (document.getElementById("utmbTokenInput")?.value || "").trim();
      if (!raw) return;
      // Accept either the raw access_token JWT or a full Cookie header string
      const m = raw.match(/(?:^|;\s*)access_token=([^;]+)/);
      const token = m ? m[1].trim() : raw;
      state.utmbToken = token;
      updateUtmbTokenStatus();
      // Refresh status every minute while on the page
      clearInterval(window._utmbTokenTimer);
      window._utmbTokenTimer = setInterval(updateUtmbTokenStatus, 60000);
    });
    document.getElementById("utmbSearchBtn")?.addEventListener("click", utmbSearch);
    document.getElementById("utmbSearch")?.addEventListener("keydown", e => { if (e.key === "Enter") utmbSearch(); });
    document.getElementById("utmbMergeBtn")?.addEventListener("click", mergeSelectedUtmbGroups);
    document.getElementById("utmbFilter")?.addEventListener("input", e => {
      utmbSearchState.filterText = e.target.value.trim();
      utmbSearchState.selectedIndices.clear();
      renderUtmbResults();
    });
    document.getElementById("utmbBackBtn")?.addEventListener("click", () => {
      document.getElementById("utmbEditionPanel").style.display = "none";
      if (utmbSearchState.grouped.length) document.getElementById("utmbResultsPanel").style.display = "";
    });

    // Discover
    document.getElementById("discoverSearchBtn")?.addEventListener("click", discoverSearch);

    // Edition picker back button — re-render rows so buttons reset to "+ Editions"
    document.getElementById("backToDiscoverBtn")?.addEventListener("click", () => {
      document.getElementById("editionPickerPanel").style.display = "none";
      if (state.discoverRaces.length) {
        renderDiscoverResults();
        document.getElementById("discoverResultsPanel").style.display = "";
      }
    });

    // Import queue
    document.getElementById("startQueueBtn")?.addEventListener("click", startQueue);
    document.getElementById("clearDoneBtn")?.addEventListener("click", () => {
      state.importQueue = state.importQueue.filter(j => j.status !== "done");
      renderQueue();
    });

    // Races tab search
    const raceSearch = document.getElementById("searchRace");
    raceSearch?.addEventListener("input", () => renderAdminRaceList(raceSearch.value));

    // Sign out
    document.getElementById("signOutBtn")?.addEventListener("click", async () => {
      await window.supabaseClient?.auth.signOut();
      location.href = "/login/";
    });

    renderQueue();
    renderAdminRaceList("");
  }

  // Shared nav tabs
  document.getElementById("tabRciNorm")?.addEventListener("click", () => setActiveTab("rcinormcharts"));
  document.getElementById("tabTrends")?.addEventListener("click", () => setActiveTab("trends"));
  document.getElementById("vizTabParity")?.addEventListener("click", () => setActiveTab("visualization"));
  document.getElementById("tabCharts")?.addEventListener("click", () => setActiveTab("charts"));
  document.getElementById("tabImport")?.addEventListener("click", () => setActiveTab("import"));
  document.getElementById("tabUtmb")?.addEventListener("click", () => setActiveTab("utmb"));
  document.getElementById("tabRaces")?.addEventListener("click", () => setActiveTab("races"));

  // Lang toggle
  document.getElementById("langToggle")?.addEventListener("click", () => setLang(lang === "fr" ? "en" : "fr"));

  // Source toggle (in picker modal)
  document.querySelectorAll(".btn-source").forEach(btn => {
    btn.addEventListener("click", () => switchSource(btn.dataset.s));
  });
  renderSourceToggle();

  // Init Plotly placeholders
  if (document.getElementById("plot")) {
    Plotly.newPlot("plot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  }
  if (document.getElementById("vizParityPlot")) {
    Plotly.newPlot("vizParityPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  }
  if (document.getElementById("trendsPlot")) {
    Plotly.newPlot("trendsPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  }

  applyLang();
  setActiveTab(state.activeTab);
  await updateAll();

  // Auto-open picker on landing when nothing is selected
  if (state.appMode === "public" && state.rciNormSelected.size === 0) {
    openPicker();
  }

  window.addEventListener("resize", () => {
    ["trendsPlot", "vizParityPlot", "plot"].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.children.length) Plotly.Plots.resize(el);
    });
  });
})();
