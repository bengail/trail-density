// Trail Race Analytics v2 (JSON-based)
// Loads data/courses_index.json then fetches per-course JSON on demand.
// Produces: summary table + rank curve + Lorenz + decile heatmap.

const MAX_INDEX_FOR_NORM = 1000; // used for AUC normalization (matches earlier convention)
const TAB_ALLOWLIST = {
  public: ["rcinormcharts", "visualization"],
  admin: ["summary", "charts", "race", "import"]
};
const DEFAULT_TAB_BY_MODE = {
  public: "rcinormcharts",
  admin: "summary"
};
const LADDER_N_LEVELS = [3, 5, 10, 20, 30];
const PARITY_N_LEVELS = [3, 5, 10, 20];

function getAppContext() {
  const path = window.location.pathname || "/";
  const isAdmin =
    path === "/admin" ||
    path === "/admin/" ||
    path.endsWith("/admin/index.html") ||
    path.endsWith("/admin");
  return {
    mode: isAdmin ? "admin" : "public",
    assetPrefix: isAdmin ? "../" : ""
  };
}

function isTabAllowed(mode, tab) {
  const allowed = TAB_ALLOWLIST[mode] || [];
  return allowed.includes(tab);
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

// population std (divide by N). This matches the RCI explanation (mean - std).
function stdPop(arr) {
  if (arr.length < 1) return NaN;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
  return Math.sqrt(v);
}

function aucTrapezoid(xs, ys) {
  let a = 0;
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1];
    a += (dx * (ys[i] + ys[i - 1])) / 2;
  }
  return a;
}

function gini(values) {
  const x = values.slice().filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const n = x.length;
  if (n === 0) return NaN;
  const sum = x.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) num += (i + 1) * x[i];
  return (2 * num) / (n * sum) - (n + 1) / n;
}

function lorenzPoints(values) {
  const v = values.slice().filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { x: [0, 1], y: [0, 1] };
  const total = v.reduce((s, x) => s + x, 0);
  if (total === 0) return { x: [0, 1], y: [0, 1] };
  const x = [0];
  const y = [0];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += v[i];
    x.push((i + 1) / n);
    y.push(cum / total);
  }
  return { x, y };
}

function bucketRanges(topN, bucketCount) {
  const size = Math.max(1, Math.ceil(topN / bucketCount));
  const ranges = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = i * size + 1;
    if (start > topN) break;
    ranges.push({ start, end: Math.min(topN, (i + 1) * size) });
  }
  return ranges;
}

function bucketMeansByRank(results, ranges) {
  return ranges.map(({ start, end }) => {
    const bucket = results
      .filter(r => r.rank >= start && r.rank <= end)
      .map(r => r.index);
    return bucket.length ? mean(bucket) : null;
  });
}

function topScoresFrom(results, n, limitByRank = true) {
  let valid = (results || [])
    .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index) && r.rank >= 1)
    .sort((a, b) => a.rank - b.rank);
  if (limitByRank) {
    valid = valid.filter(r => r.rank <= n);
  }
  return valid.slice(0, n).map(r => r.index);
}

function rciFromResults(results, n, limitByRank = true) {
  const values = topScoresFrom(results, n, limitByRank);
  if (!values.length) return NaN;
  return mean(values) - stdPop(values);
}

function normalizeItraFemaleIndex(score) {
  if (!Number.isFinite(score)) return NaN;
  return ((-0.000466 * score) + 1.532) * score;
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
  if (clampedMax <= clampedMin) return "background:hsl(224, 78%, 93%); color:#0f172a; font-weight:600;";
  const ratio = Math.max(0, Math.min(1, (value - clampedMin) / (clampedMax - clampedMin)));
  const lightness = 98 - ratio * 24;
  const bg = `hsl(224, 82%, ${lightness}%)`;
  const borderAlpha = (0.1 + ratio * 0.24).toFixed(3);
  return `background:${bg}; color:#0f172a; font-weight:600; box-shadow: inset 0 0 0 1px rgba(15,23,42,${borderAlpha});`;
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

function normalizeCourse(course, fallbackRaceId) {
  const meta = course.meta || {};
  const raceId = meta.race_id || fallbackRaceId;
  return {
    ...course,
    meta: {
      ...meta,
      race_id: raceId,
      series: normalizeSeries(meta.series)
    },
    results: (course.results || [])
      .map(r => ({
        rank: Number(r.rank),
        index: Number(r.index),
        runner: r.runner ?? null,
        gender: r.gender ?? null,
        nationality: r.nationality ?? null
      }))
      .filter(r => Number.isFinite(r.rank) && Number.isFinite(r.index))
      .sort((a, b) => a.rank - b.rank)
  };
}

// ---- Data loading ----
let manifest = null;
const courseCache = new Map(); // race_id -> course json
const courseMetaCache = new Map(); // race_id -> course.meta

async function loadManifest() {
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

async function loadCourse(raceId) {
  if (courseCache.has(raceId)) return courseCache.get(raceId);
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
  const entries = getManifestEntries();
  await Promise.all(entries.map(e => loadCourse(e.race_id).catch(() => null)));
}

// ---- UI state ----
const state = {
  appMode: "public",
  assetPrefix: "",
  summarySort: { key: "rci10", dir: "desc" },
  summarySelected: new Set(),
  chartsSelected: new Set(),
  topN: 30,
  summaryFilters: { country: "", series: "" },
  chartsFilters: { country: "", series: "" },
  raceSelected: null
  ,
  rciSelected: new Set(),
  rciFilters: { country: "", series: [] },
  rciSorts: {
    female: { key: "rc10", dir: "desc" },
    male: { key: "rc10", dir: "desc" }
  },
  rciNormSelected: new Set(),
  rciNormFilters: { country: "", series: [] },
  rciNormSorts: {
    female: { key: "rc10", dir: "desc" },
    male: { key: "rc10", dir: "desc" }
  },
  vizSelected: new Set(),
  vizFilters: { country: "", series: [] },
  publicRaceSearch: "",
  vizType: "ladder",
  vizLadderSex: "male",
  vizParityNSet: PARITY_N_LEVELS.slice(),
  vizParityConnect: true,
  activeTab: "rcinormcharts",
  importDraft: null
};

// Public tabs should share exactly the same filtering state.
state.vizSelected = state.rciNormSelected;
state.vizFilters = state.rciNormFilters;

function matchesFilters(meta, filters) {
  const countryOk = !filters.country || (meta?.country || "") === filters.country;
  const seriesFilter = filters.series;
  const normalizedSeries = normalizeSeries(meta?.series);
  const seriesList = Array.isArray(seriesFilter)
    ? seriesFilter.filter(Boolean)
    : seriesFilter ? [seriesFilter] : [];
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

function wireRaceFilterPanel(config) {
  const {
    listEl,
    searchEl,
    countryEl,
    seriesEl,
    countEl,
    selectedSet,
    filters,
    onUpdate,
    buttonConfigs
  } = config;

  function renderSelection() {
    renderCourseList(listEl, selectedSet, searchEl?.value || "", {
      filters,
      onSelectionChange: () => {
        renderSelection();
        onUpdate();
      }
    });
    if (countEl) countEl.textContent = String(selectedSet.size);
  }

  renderFilterOptions(countryEl, seriesEl, filters);

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      renderSelection();
    });
  }

  if (countryEl) {
    countryEl.addEventListener("change", () => {
      filters.country = countryEl.value;
      applyFiltersToSelection(selectedSet, filters);
      renderSelection();
      onUpdate();
    });
  }

  if (seriesEl) {
    seriesEl.addEventListener("change", () => {
      const values = Array.from(seriesEl.selectedOptions).map(o => o.value).filter(Boolean);
      filters.series = values;
      applyFiltersToSelection(selectedSet, filters);
      renderSelection();
      onUpdate();
    });
  }

  for (const [id, fn] of buttonConfigs || []) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => {
      fn();
      renderSelection();
      onUpdate();
    });
  }

  renderSelection();
}

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

function renderFilterOptions(countrySelect, seriesSelect, filters) {
  if (!countrySelect || !seriesSelect) return;

  const countries = new Set();
  const seriesValues = new Set();
  for (const c of getManifestEntries()) {
    const meta = getCourseMeta(c.race_id);
    if (meta?.country) countries.add(meta.country);
    for (const s of normalizeSeries(meta?.series)) seriesValues.add(s);
  }

  const countryOptions = ['<option value="">All countries</option>']
    .concat(Array.from(countries).sort().map(v => `<option value="${v}">${v}</option>`))
    .join("");
  const sortedSeries = Array.from(seriesValues).sort();
  const seriesOptions =
    seriesSelect.multiple
      ? ['<option value="" disabled>All series</option>']
          .concat(sortedSeries.map(v => `<option value="${v}">${v}</option>`))
          .join("")
      : ['<option value="">All series</option>']
          .concat(sortedSeries.map(v => `<option value="${v}">${v}</option>`))
          .join("");

  countrySelect.innerHTML = countryOptions;
  seriesSelect.innerHTML = seriesOptions;
  countrySelect.value = filters.country;
  if (seriesSelect.multiple) {
    const selected = new Set(Array.isArray(filters.series) ? filters.series : []);
    for (const option of seriesSelect.options) {
      option.selected = option.value ? selected.has(option.value) : false;
    }
  } else {
    seriesSelect.value = filters.series || "";
  }
}

function syncMultiSelectValues(selectEl, values) {
  if (!selectEl || !selectEl.multiple) return;
  const selected = new Set(Array.isArray(values) ? values : []);
  for (const option of selectEl.options) {
    option.selected = option.value ? selected.has(option.value) : false;
  }
}

function getRciResultsForMode(results, gender, normalizeFemale) {
  const filtered = filterResultsByGender(results, gender);
  if (!normalizeFemale || gender !== "female") return filtered;
  return filtered.map(r => ({ ...r, index: normalizeItraFemaleIndex(r.index) }));
}

async function renderRciTable(gender, tableId, options = {}) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = await getRciRowsForGender(gender, options);

  const metrics = rows.flatMap(r => ["rc3", "rc5", "rc10", "rc20"].map(k => r[k]).filter(Number.isFinite));
  const minValue = metrics.length ? Math.min(...metrics) : 0;
  const maxValue = metrics.length ? Math.max(...metrics) : 0;
  const sorts = options.sorts || state.rciSorts;
  const sort = sorts[gender];

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.country || "-"}</td>
      <td>${r.series || "-"}</td>
      <td style="${densityColor(r.rc3, minValue, maxValue)}">${fmt(r.rc3, 2)}</td>
      <td style="${densityColor(r.rc5, minValue, maxValue)}">${fmt(r.rc5, 2)}</td>
      <td style="${densityColor(r.rc10, minValue, maxValue)}">${fmt(r.rc10, 2)}</td>
      <td style="${densityColor(r.rc20, minValue, maxValue)}">${fmt(r.rc20, 2)}</td>
    `;
    tbody.appendChild(tr);
  }

  const thead = document.querySelector(`#${tableId} thead`);
  if (thead) {
    const ths = Array.from(thead.querySelectorAll("th[data-key]"));
    ths.forEach(th => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.key === sort.key) {
        th.classList.add(sort.dir === "asc" ? "sort-asc" : "sort-desc");
      }
    });
  }
}

async function getRciRowsForGender(gender, options = {}) {
  const selectedSet = options.selectedSet || state.rciSelected;
  const filters = options.filters || state.rciFilters;
  const sorts = options.sorts || state.rciSorts;
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
    const va = a[sort.key];
    const vb = b[sort.key];
    const aNum = Number.isFinite(va);
    const bNum = Number.isFinite(vb);
    let cmp = 0;
    if (aNum && bNum) cmp = va - vb;
    else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return rows;
}

async function updateRciTablesForConfig(config) {
  await renderRciTable("female", config.femaleTableId, config);
  await renderRciTable("male", config.maleTableId, config);
}

async function updateRciTables() {
  await updateRciTablesForConfig({
    selectedSet: state.rciSelected,
    filters: state.rciFilters,
    sorts: state.rciSorts,
    femaleTableId: "rcifemaleTable",
    maleTableId: "rcimaleTable",
    normalizeFemale: false
  });
}

async function updateRciNormTables() {
  await updateRciTablesForConfig({
    selectedSet: state.rciNormSelected,
    filters: state.rciNormFilters,
    sorts: state.rciNormSorts,
    femaleTableId: "rcinormfemaleTable",
    maleTableId: "rcinormmaleTable",
    normalizeFemale: true
  });
}

function setVizLadderSex(sex) {
  state.vizLadderSex = sex;
  const maleBtn = document.getElementById("vizLadderMale");
  const femaleBtn = document.getElementById("vizLadderFemale");
  if (maleBtn) maleBtn.classList.toggle("active", sex === "male");
  if (femaleBtn) femaleBtn.classList.toggle("active", sex === "female");
}

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
  const nLevels = options.nLevels || LADDER_N_LEVELS;
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
          year: meta.year,
          series: normalizeSeries(meta.series).join(", ") || "-",
          sex,
          n,
          rci: stats.rci,
          topMean: stats.mean,
          topStd: stats.std
        });
      }
    }
  }
  return points;
}

function showVizContainer() {
  const ladderLayout = document.getElementById("vizLadderLayout");
  const ladderControls = document.getElementById("vizLadderControls");
  const parityPlot = document.getElementById("vizParityPlot");
  const parityControls = document.getElementById("vizParityControls");

  const ladderOn = state.vizType === "ladder";
  const parityOn = state.vizType === "parity";

  if (ladderLayout) ladderLayout.style.display = ladderOn ? "grid" : "none";
  if (ladderControls) ladderControls.style.display = ladderOn ? "flex" : "none";
  if (parityPlot) parityPlot.style.display = parityOn ? "block" : "none";
  if (parityControls) parityControls.style.display = parityOn ? "flex" : "none";

  const vizTitle = document.getElementById("vizTitle");
  if (vizTitle) {
    const titleByType = {
      ladder: "Visualization · RCI Ladder",
      parity: "Visualization · RCI Parity Map"
    };
    vizTitle.innerHTML = `<b>${titleByType[state.vizType] || "Visualization"}</b>`;
  }

  const vizTopMenu = document.getElementById("vizTopMenu");
  if (vizTopMenu) vizTopMenu.value = state.activeTab === "visualization" ? state.vizType : "";
}

function updateVizExplanation() {
  const el = document.getElementById("vizExplainContent");
  if (!el) return;
  const explanations = {
    ladder: "RCI ladder: each race appears as a mini-profile across N (3/5/10/20/30). Click a point to see the closest RCI matches.",
    parity: "RCI parity map: compares men vs women RCI for each race and N. The dashed diagonal marks parity between men and women."
  };
  el.textContent = explanations[state.vizType] || "Choose a visualization to see details.";
}

function renderClosestMatches(clicked, points) {
  const box = document.getElementById("vizClosestMatches");
  if (!box) return;
  const matches = points
    .filter(p => p !== clicked)
    .map(p => ({ ...p, delta: Math.abs(p.rci - clicked.rci) }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5);

  if (!matches.length) {
    box.textContent = "No close matches found.";
    return;
  }

  box.innerHTML = `
    <div style="margin-bottom:8px;"><b>${clicked.race_id}</b> · ${clicked.sex === "male" ? "Men" : "Women"} · N=${clicked.n} · RCI=${fmt(clicked.rci, 2)}</div>
    <table>
      <thead><tr><th>Race</th><th>Sex</th><th>N</th><th>RCI</th><th>|ΔRCI|</th></tr></thead>
      <tbody>
        ${matches.map(m => `<tr><td>${m.race_id}</td><td>${m.sex === "male" ? "M" : "F"}</td><td>${m.n}</td><td>${fmt(m.rci, 2)}</td><td>${fmt(m.delta, 2)}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

async function renderLadderVisualization(ids) {
  const points = await getVizRciPoints({ ids, nLevels: LADDER_N_LEVELS });
  const panelSex = state.vizLadderSex;
  const filtered = points.filter(p => p.sex === panelSex);
  if (!filtered.length) {
    Plotly.react("vizLadderPlot", [], { annotations: [{ x: 0.5, y: 0.5, xref: "paper", yref: "paper", text: "No data for current filters", showarrow: false }] }, { responsive: true, displayModeBar: false });
    return;
  }
  const colorByRace = new Map();
  const palette = ["#0ea5e9", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#14b8a6", "#84cc16"];
  let idx = 0;
  const symbols = { 3: "circle", 5: "diamond", 10: "square", 20: "x", 30: "triangle-up" };
  const traces = [];
  const allRci = points.map(p => p.rci).filter(Number.isFinite);
  for (const p of filtered) {
    if (!colorByRace.has(p.race_id)) colorByRace.set(p.race_id, palette[idx++ % palette.length]);
    traces.push({
      type: "scattergl",
      mode: "markers",
      x: [p.rci],
      y: [p.n],
      name: p.race_id,
      marker: { size: 10, color: colorByRace.get(p.race_id), symbol: symbols[p.n] || "circle", line: { width: 0.7, color: "#0f172a" } },
      customdata: [[p.race_id, p.year || "-", p.series, p.sex === "male" ? "Men" : "Women", p.n, fmt(p.rci, 2), fmt(p.topMean, 2), fmt(p.topStd, 2)]],
      hovertemplate: "<b>%{customdata[0]}</b><br>Year: %{customdata[1]}<br>Series: %{customdata[2]}<br>Sex: %{customdata[3]}<br>N: %{customdata[4]}<br>RCI: %{customdata[5]}<br>topN mean: %{customdata[6]}<br>topN std: %{customdata[7]}<extra></extra>",
      showlegend: false
    });
  }
  const minX = Math.min(...allRci);
  const maxX = Math.max(...allRci);
  const pad = Math.max(1, (maxX - minX) * 0.05);
  Plotly.react("vizLadderPlot", traces, {
    margin: { l: 60, r: 20, t: 24, b: 50 },
    xaxis: { title: "Sex-normalized RCI", range: [minX - pad, maxX + pad] },
    yaxis: { title: "N", type: "category", categoryorder: "array", categoryarray: LADDER_N_LEVELS },
    hovermode: "closest"
  }, { responsive: true, displayModeBar: false });

  const ladderEl = document.getElementById("vizLadderPlot");
  if (ladderEl && !ladderEl._closestBound) {
    ladderEl.on("plotly_click", evt => {
      const cd = evt?.points?.[0]?.customdata;
      if (!cd) return;
      const clicked = points.find(p => p.race_id === cd[0] && p.sex === (cd[3] === "Men" ? "male" : "female") && p.n === cd[4]);
      if (clicked) renderClosestMatches(clicked, points);
    });
    ladderEl._closestBound = true;
  }
}

async function renderParityVisualization(ids) {
  const nSet = state.vizParityNSet;
  const points = await getVizRciPoints({ ids, nLevels: nSet });
  const key = p => `${p.race_id}::${p.year}::${p.series}::${p.n}`;
  const grouped = new Map();
  for (const p of points) {
    if (!grouped.has(key(p))) grouped.set(key(p), { ...p, male: NaN, female: NaN });
    const g = grouped.get(key(p));
    if (p.sex === "male") g.male = p.rci;
    if (p.sex === "female") g.female = p.rci;
  }
  const rows = Array.from(grouped.values()).filter(r => Number.isFinite(r.male) && Number.isFinite(r.female));
  if (!rows.length) {
    Plotly.react("vizParityPlot", [], { annotations: [{ x: 0.5, y: 0.5, xref: "paper", yref: "paper", text: "No parity pairs for current filters", showarrow: false }] }, { responsive: true, displayModeBar: false });
    return;
  }
  const palette = ["#0ea5e9", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b"];
  const raceColors = new Map();
  let ci = 0;
  const symbolByN = { 3: "circle", 5: "diamond", 10: "square", 20: "x" };
  const traces = [];
  const byRace = new Map();
  for (const r of rows) {
    if (!raceColors.has(r.race_id)) raceColors.set(r.race_id, palette[ci++ % palette.length]);
    if (!byRace.has(r.race_id)) byRace.set(r.race_id, []);
    byRace.get(r.race_id).push(r);
    traces.push({
      type: "scattergl", mode: "markers", x: [r.male], y: [r.female], name: `${r.race_id} N${r.n}`,
      marker: { size: 10, color: raceColors.get(r.race_id), symbol: symbolByN[r.n] || "circle", line: { width: 0.8, color: "#0f172a" } },
      customdata: [[r.race_id, r.year || "-", r.series, r.n, fmt(r.male, 2), fmt(r.female, 2), fmt(r.female - r.male, 2)]],
      hovertemplate: "<b>%{customdata[0]}</b><br>Year: %{customdata[1]}<br>Series: %{customdata[2]}<br>N: %{customdata[3]}<br>RCI_M: %{customdata[4]}<br>RCI_F: %{customdata[5]}<br>Δ: %{customdata[6]}<extra></extra>",
      showlegend: false
    });
  }
  if (state.vizParityConnect) {
    for (const [raceId, arr] of byRace) {
      const ordered = arr.slice().sort((a, b) => a.n - b.n);
      traces.push({ type: "scattergl", mode: "lines", x: ordered.map(r => r.male), y: ordered.map(r => r.female), line: { width: 1, color: raceColors.get(raceId) }, hoverinfo: "skip", showlegend: false });
    }
  }
  const values = rows.flatMap(r => [r.male, r.female]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max(1, (maxV - minV) * 0.06);
  traces.push({ x: [minV - pad, maxV + pad], y: [minV - pad, maxV + pad], mode: "lines", line: { dash: "dash", color: "#64748b" }, name: "y=x", hoverinfo: "skip" });
  Plotly.react("vizParityPlot", traces, {
    margin: { l: 60, r: 20, t: 24, b: 50 },
    xaxis: { title: "RCI_N Men", range: [minV - pad, maxV + pad] },
    yaxis: { title: "RCI_N Women", range: [minV - pad, maxV + pad] },
    hovermode: "closest"
  }, { responsive: true, displayModeBar: false });
}

async function updateVisualization() {
  if (state.vizType !== "ladder" && state.vizType !== "parity") state.vizType = "ladder";
  const ids = getVizFilteredIds();
  const countEl = document.getElementById("vizCount");
  if (countEl) countEl.textContent = String(ids.length);
  showVizContainer();
  updateVizExplanation();
  if (state.vizType === "parity") return renderParityVisualization(ids);
  return renderLadderVisualization(ids);
}

function wireRciSort(tableId, gender, sorts, onChange) {
  const thead = document.querySelector(`#${tableId} thead`);
  if (!thead) return;
  const ths = Array.from(thead.querySelectorAll("th[data-key]"));
  ths.forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sorts[gender].key === key) {
        sorts[gender].dir = sorts[gender].dir === "asc" ? "desc" : "asc";
      } else {
        sorts[gender].key = key;
        sorts[gender].dir = "desc";
      }
      onChange();
    });
  });
}

function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const header = ["Race", "Country", "Series", "RCI3", "RCI5", "RCI10", "RCI20"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.country || "",
        r.series || "",
        Number.isFinite(r.rc3) ? r.rc3.toFixed(2) : "",
        Number.isFinite(r.rc5) ? r.rc5.toFixed(2) : "",
        Number.isFinite(r.rc10) ? r.rc10.toFixed(2) : "",
        Number.isFinite(r.rc20) ? r.rc20.toFixed(2) : ""
      ].map(csvCell).join(",")
    );
  }
  return lines.join("\n");
}

function triggerCsvDownload(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function triggerJsonDownload(filename, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  const normalized = text.replace(",", ".");
  return Number(normalized);
}

function looksLikeHeader(cells) {
  const h = cells.map(normalizeHeaderKey);
  const known = new Set([
    "rank",
    "position",
    "pos",
    "place",
    "runner",
    "name",
    "athlete",
    "time",
    "race_score",
    "score",
    "index",
    "itra_score",
    "utmb_index",
    "gender",
    "sex",
    "nationality",
    "country",
    "nation",
    "nat"
  ]);
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
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rankText =
      readField(row, headers, ["rank", "position", "pos", "place", "overall_rank"]) ||
      row[0] ||
      "";
    const runnerText =
      readField(row, headers, ["runner", "name", "athlete", "runner_name", "full_name"]) ||
      row[1] ||
      "";
    const indexText =
      readField(row, headers, ["race_score", "score", "index", "itra_score", "utmb_index"]) ||
      row[3] ||
      findLikelyScoreCell(row);
    const genderText =
      readField(row, headers, ["gender", "sex"]) ||
      row[5] ||
      "";
    const nationalityText =
      readField(row, headers, ["nationality", "country", "nation", "nat"]) ||
      row[6] ||
      "";

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

  if (!results.length) {
    throw new Error("No valid rows found. Need numeric rank and race score/index columns.");
  }

  results.sort((a, b) => a.rank - b.rank);
  return results;
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
    tr.innerHTML = `
      <td>${r.rank}</td>
      <td>${r.runner ?? "-"}</td>
      <td>${fmt(r.index, 1)}</td>
      <td>${r.gender ?? "-"}</td>
      <td>${r.nationality ?? "-"}</td>
    `;
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
    race_id: raceId,
    name,
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

  return {
    meta,
    results
  };
}

function buildUpdatedManifestForImport(raceId) {
  const courses = getManifestEntries().map(c => ({ race_id: c.race_id, path: c.path }));
  const newEntry = {
    race_id: raceId,
    path: `data/courses/${raceId}.json`
  };
  const existingIndex = courses.findIndex(c => c.race_id === raceId);
  if (existingIndex >= 0) courses[existingIndex] = newEntry;
  else courses.push(newEntry);
  courses.sort((a, b) => a.race_id.localeCompare(b.race_id));
  return { courses };
}

function buildImportJson() {
  try {
    const draft = readImportDraftFromForm();
    state.importDraft = draft;
    renderImportPreview(draft.results);
    setImportStatus(
      `JSON built successfully (${draft.results.length} results).`,
      "ok"
    );
  } catch (err) {
    state.importDraft = null;
    renderImportPreview([]);
    setImportStatus(err.message || "Unable to build JSON.", "error");
  }
}

function downloadImportRaceJson() {
  if (!state.importDraft) {
    setImportStatus("Build JSON first before downloading.", "error");
    return;
  }
  const raceId = state.importDraft.meta?.race_id || "race";
  triggerJsonDownload(`${raceId}.json`, state.importDraft);
}

function downloadImportManifestJson() {
  if (!state.importDraft) {
    setImportStatus("Build JSON first before downloading courses_index.json.", "error");
    return;
  }
  const raceId = state.importDraft.meta?.race_id || "";
  const updatedManifest = buildUpdatedManifestForImport(raceId);
  triggerJsonDownload("courses_index.json", updatedManifest);
}

// ---- Metrics ----
function topScores(course, n) {
  return topScoresFrom(course.results, n);
}

function rci(course, n) {
  return rciFromResults(course.results, n);
}

function aucNormTopN(course, topN) {
  const rs = course.results.filter(r => r.rank >= 1 && r.rank <= topN);
  if (rs.length < 2) return NaN;
  const xs = rs.map(r => r.rank);
  const ys = rs.map(r => r.index);
  const auc = aucTrapezoid(xs, ys);
  return auc / (topN * MAX_INDEX_FOR_NORM);
}

// ---- Summary table ----
async function updateSummaryTable() {
  const tbody = document.querySelector("#summaryTable tbody");
  tbody.innerHTML = "";

  const ids = Array.from(state.summarySelected).sort();
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const rows = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const course = courses[i];
    if (!course) continue;

    const meta = course.meta || {};
    if (!matchesFilters(meta, state.summaryFilters)) continue;

    const top3 = mean(topScores(course, 3));
    const top5 = mean(topScores(course, 5));
    const top10 = mean(topScores(course, 10));
    const series = normalizeSeries(meta.series).join(", ");

    rows.push({
      name: meta.name || id,
      year: meta.year ?? null,
      series: series || "",
      country: meta.country || "",
      src: meta.data_source || "",
      top3,
      top5,
      top10,
      rci5: rci(course, 5),
      rci10: rci(course, 10),
      rci20: rci(course, 20),
      aucNorm: aucNormTopN(course, 30),
      gini: gini(course.results.filter(r => r.rank >= 1 && r.rank <= 30).map(r => r.index))
    });
  }

  const sk = state.summarySort?.key || "rci10";
  const dir = state.summarySort?.dir || "desc";
  rows.sort((a, b) => {
    const va = a[sk];
    const vb = b[sk];
    const aNum = Number.isFinite(va);
    const bNum = Number.isFinite(vb);
    let cmp = 0;
    if (aNum && bNum) cmp = va - vb;
    else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    return dir === "asc" ? cmp : -cmp;
  });

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.year ?? "-"}</td>
      <td>${r.series || "-"}</td>
      <td>${r.country || "-"}</td>
      <td>${r.src || "-"}</td>
      <td>${fmt(r.top3, 1)}</td>
      <td>${fmt(r.top5, 1)}</td>
      <td>${fmt(r.top10, 1)}</td>
      <td>${fmt(r.rci5, 2)}</td>
      <td>${fmt(r.rci10, 2)}</td>
      <td>${fmt(r.rci20, 2)}</td>
      <td>${fmt(r.aucNorm, 4)}</td>
      <td>${fmt(r.gini, 4)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById("summaryCount").textContent = String(state.summarySelected.size);
}

// ---- Charts ----
function getCourseLabel(course) {
  return course.meta?.name || course.meta?.race_id || course.race_id;
}

function groupForCharts(courses, topN) {
  const grouped = new Map();
  for (const c of courses) {
    const id = c.meta?.race_id || c.race_id;
    const arr = (c.results || [])
      .filter(r => r.rank >= 1 && r.rank <= topN)
      .sort((a, b) => a.rank - b.rank);
    grouped.set(id, { label: getCourseLabel(c), arr });
  }
  return grouped;
}

function updateRankPlot(grouped, topN) {
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

  Plotly.react(
    "plot",
    traces,
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 55, r: 20, t: 10, b: 50 },
      font: { family: "Inter, system-ui, sans-serif", size: 11 },
      xaxis: { title: "Rank (Top N)", range: [1, topN], gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
      yaxis: { title: "Index (Race Score)", gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
      hovermode: "x unified"
    },
    { responsive: true, displayModeBar: false }
  );
}

function updateLorenzPlot(grouped) {
  const traces = [
    {
      x: [0, 1],
      y: [0, 1],
      mode: "lines",
      name: "Equality (perfect distribution)",
      line: { width: 2, dash: "dot" },
      hoverinfo: "skip"
    }
  ];

  const ids = Array.from(grouped.keys()).sort();
  for (const id of ids) {
    const entry = grouped.get(id);
    const arr = entry?.arr || [];
    const label = entry?.label || id;
    const values = arr.map(r => r.index);
    const G = gini(values);
    const L = lorenzPoints(values);
    traces.push({
      x: L.x,
      y: L.y,
      mode: "lines",
      name: `${label} (Gini=${fmt(G, 4)})`,
      hovertemplate: `${label}<br>% athletes=%{x:.2f}<br>% index=%{y:.2f}<extra></extra>`,
      line: { width: 2 }
    });
  }

  Plotly.react(
    "lorenzPlot",
    traces,
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 55, r: 20, t: 10, b: 50 },
      font: { family: "Inter, system-ui, sans-serif", size: 11 },
      xaxis: { title: "% cumulative athletes (low to high)", range: [0, 1], gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
      yaxis: { title: "% cumulative index", range: [0, 1], gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
      hovermode: "closest"
    },
    { responsive: true, displayModeBar: false }
  );
}

function updateHeatmap(grouped, topN) {

  const ids = Array.from(grouped.keys()).sort();
  const bucketCount = Math.min(10, Math.max(3, Math.ceil(topN / 10)));
  const ranges = bucketRanges(topN, bucketCount);
  const xLabels = ranges.map(r => `${r.start}-${r.end}`);
  const z = [];
  const y = [];
  for (const id of ids) {
    const entry = grouped.get(id) || {};
    const arr = entry.arr || [];
    const label = entry.label || id;
    const dec = bucketMeansByRank(arr, ranges);
    z.push(dec.map(v => (Number.isFinite(v) ? v : null)));
    y.push(label);
  }
  Plotly.react(
    "heatmapPlot",
    [
      {
        type: "heatmap",
        x: xLabels,
        y: y,
        z: z,
        hovertemplate: "Course=%{y}<br>Bucket=%{x}<br>Mean=%{z:.1f}<extra></extra>"
      }
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 95, r: 20, t: 10, b: 55 },
      xaxis: { title: `Rank buckets (1-${topN})` },
      yaxis: { title: "Course" }
    },
    { responsive: true, displayModeBar: false }
  );
}

async function updateCharts() {
  const topN = state.topN;
  document.getElementById("nLabel").textContent = String(topN);
  document.getElementById("chartsCount").textContent = String(state.chartsSelected.size);

  const ids = Array.from(state.chartsSelected).sort();
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const grouped = groupForCharts(courses.filter(Boolean), topN);

  updateRankPlot(grouped, topN);
  updateLorenzPlot(grouped);
  updateHeatmap(grouped, topN);
}

function renderRaceList(searchQuery) {
  const list = document.getElementById("raceList");
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
    rb.addEventListener("change", () => {
      state.raceSelected = id;
      updateRaceDisplay();
    });

    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = meta.name || id;

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = getMetaLabel(meta);

    row.appendChild(rb);
    row.appendChild(label);
    row.appendChild(pill);
    list.appendChild(row);
  }
}

function renderMetaCard(key, value) {
  const safe = value === null || value === undefined || value === "" ? "-" : String(value);
  return `<div class="metaCard"><div class="k">${key}</div><div class="v">${safe}</div></div>`;
}

function applyAppModeVisibility(mode) {
  const publicButtons = ["tabRci", "tabRciNorm", "vizTopMenu"];
  const adminButtons = ["tabSummary", "tabCharts", "tabRace", "tabImport"];
  const publicPages = ["pageRci", "pageRciNorm", "pageViz"];
  const adminPages = ["pageSummary", "pageCharts", "pageRace", "pageImport"];

  const hide = (id, hidden) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = hidden;
  };

  const isAdmin = mode === "admin";
  for (const id of publicButtons) hide(id, isAdmin);
  for (const id of adminButtons) hide(id, !isAdmin);
  for (const id of publicPages) hide(id, isAdmin);
  for (const id of adminPages) hide(id, !isAdmin);
}

async function updateRaceDisplay() {
  if (!state.raceSelected) return;
  const course = await loadCourse(state.raceSelected).catch(() => null);
  if (!course) return;

  const meta = course.meta || {};
  const metaEl = document.getElementById("raceMeta");
  const series = normalizeSeries(meta.series).join(", ");
  const sourceLink = meta.source_url ? `<a href="${meta.source_url}" target="_blank" rel="noopener noreferrer">${meta.source_url}</a>` : "-";

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
  tbody.innerHTML = "";
  for (const r of course.results || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.rank}</td>
      <td>${r.runner ?? "-"}</td>
      <td>${fmt(r.index, 1)}</td>
      <td>${r.gender ?? "-"}</td>
      <td>${r.nationality ?? "-"}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ---- Page switching ----
function setActiveTab(tab) {
  const safeTab = getSafeTab(state.appMode, tab);
  state.activeTab = safeTab;
  const rci = document.getElementById("pageRci");
  const rciNorm = document.getElementById("pageRciNorm");
  const viz = document.getElementById("pageViz");
  const sum = document.getElementById("pageSummary");
  const cha = document.getElementById("pageCharts");
  const race = document.getElementById("pageRace");
  const imp = document.getElementById("pageImport");
  const bRci = document.getElementById("tabRci");
  const bRciNorm = document.getElementById("tabRciNorm");
  const bSum = document.getElementById("tabSummary");
  const bCha = document.getElementById("tabCharts");
  const bRace = document.getElementById("tabRace");
  const bImp = document.getElementById("tabImport");

  const activate = (el, active) => {
    if (!el) return;
    if (active) el.classList.add("active");
    else el.classList.remove("active");
  };

  activate(rci, safeTab === "rcicharts");
  activate(rciNorm, safeTab === "rcinormcharts");
  activate(viz, safeTab === "visualization");
  activate(sum, safeTab === "summary");
  activate(cha, safeTab === "charts");
  activate(race, safeTab === "race");
  activate(imp, safeTab === "import");

  activate(bRci, safeTab === "rcicharts");
  activate(bRciNorm, safeTab === "rcinormcharts");
  activate(bSum, safeTab === "summary");
  activate(bCha, safeTab === "charts");
  activate(bRace, safeTab === "race");
  activate(bImp, safeTab === "import");
  showVizContainer();
  updateVizExplanation();
}

// ---- Orchestrator ----
async function updateAll() {
  await updateSummaryTable();
  await updateCharts();
  await updateRciTables();
  await updateRciNormTables();
  await updateVisualization();
}

// ---- Boot ----
(async function boot() {
  const appContext = getAppContext();
  state.appMode = appContext.mode;
  state.assetPrefix = appContext.assetPrefix;
  state.activeTab = DEFAULT_TAB_BY_MODE[state.appMode];

  await loadManifest();
  await preloadAllCourseMeta();

  setSelectionByYear(state.summarySelected, 2025, state.summaryFilters);
  setSelectionByYear(state.chartsSelected, 2025, state.chartsFilters);
  setSelectionByYear(state.rciSelected, 2025, state.rciFilters);
  setSelectionByYear(state.rciNormSelected, 2025, state.rciNormFilters);
  setSelectionByYear(state.vizSelected, 2025, state.vizFilters);

  const sumList = document.getElementById("summaryList");
  const sumSearch = document.getElementById("searchSummary");
  const summaryCountryFilter = document.getElementById("summaryCountryFilter");
  const summarySeriesFilter = document.getElementById("summarySeriesFilter");

  function renderSummaryList() {
    renderCourseList(sumList, state.summarySelected, sumSearch.value, { filters: state.summaryFilters });
  }

  renderFilterOptions(summaryCountryFilter, summarySeriesFilter, state.summaryFilters);
  sumSearch.addEventListener("input", renderSummaryList);

  if (summaryCountryFilter) {
    summaryCountryFilter.addEventListener("change", () => {
      state.summaryFilters.country = summaryCountryFilter.value;
      applyFiltersToSelection(state.summarySelected, state.summaryFilters);
      renderSummaryList();
      updateSummaryTable();
    });
  }

  if (summarySeriesFilter) {
    summarySeriesFilter.addEventListener("change", () => {
      state.summaryFilters.series = summarySeriesFilter.value;
      applyFiltersToSelection(state.summarySelected, state.summaryFilters);
      renderSummaryList();
      updateSummaryTable();
    });
  }

  document.getElementById("sumAll").addEventListener("click", () => {
    setSelectionAll(state.summarySelected);
    applyFiltersToSelection(state.summarySelected, state.summaryFilters);
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sumNone").addEventListener("click", () => {
    setSelectionNone(state.summarySelected);
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2025").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2025, state.summaryFilters);
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2024").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2024, state.summaryFilters);
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2023").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2023, state.summaryFilters);
    renderSummaryList();
    updateAll();
  });

  renderSummaryList();

  function wireSummarySort() {
    const thead = document.querySelector("#summaryTable thead");
    if (!thead) return;
    const ths = Array.from(thead.querySelectorAll("th[data-key]"));

    function paint() {
      for (const th of ths) {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.summarySort.key) {
          th.classList.add(state.summarySort.dir === "asc" ? "sort-asc" : "sort-desc");
        }
      }
    }

    for (const th of ths) {
      th.addEventListener("click", () => {
        const k = th.dataset.key;
        if (state.summarySort.key === k) {
          state.summarySort.dir = state.summarySort.dir === "asc" ? "desc" : "asc";
        } else {
          state.summarySort.key = k;
          state.summarySort.dir = "desc";
        }
        paint();
        updateSummaryTable();
      });
    }

    paint();
  }
  wireSummarySort();

  const rciList = document.getElementById("rcichartList");
  const rciSearch = document.getElementById("rcichartSearch");
  const rciCountryFilter = document.getElementById("rcichartCountryFilter");
  const rciSeriesFilter = document.getElementById("rcichartSeriesFilter");
  wireRaceFilterPanel({
    listEl: rciList,
    searchEl: rciSearch,
    countryEl: rciCountryFilter,
    seriesEl: rciSeriesFilter,
    countEl: document.getElementById("rcichartCount"),
    selectedSet: state.rciSelected,
    filters: state.rciFilters,
    onUpdate: updateRciTables,
    buttonConfigs: [
      ["rcichartAll", () => { setSelectionAll(state.rciSelected); applyFiltersToSelection(state.rciSelected, state.rciFilters); }],
      ["rcichartNone", () => { setSelectionNone(state.rciSelected); }],
      ["rcichart2025", () => { setSelectionByYear(state.rciSelected, 2025, state.rciFilters); }],
      ["rcichart2024", () => { setSelectionByYear(state.rciSelected, 2024, state.rciFilters); }],
      ["rcichart2023", () => { setSelectionByYear(state.rciSelected, 2023, state.rciFilters); }]
    ]
  });

  const rciNormList = document.getElementById("rcinormList");
  const rciNormSearch = document.getElementById("rcinormSearch");
  const rciNormCountryFilter = document.getElementById("rcinormCountryFilter");
  const rciNormSeriesFilter = document.getElementById("rcinormSeriesFilter");

  const vizSearch = document.getElementById("vizSearch");
  const vizCountryFilter = document.getElementById("vizCountryFilter");
  const vizSeriesFilter = document.getElementById("vizSeriesFilter");
  const vizTopMenu = document.getElementById("vizTopMenu");
  const vizParityConnect = document.getElementById("vizParityConnect");

  function syncPublicFilterControls() {
    state.publicRaceSearch = rciNormSearch?.value || state.publicRaceSearch;
    if (rciNormSearch && vizSearch) {
      rciNormSearch.value = state.publicRaceSearch;
      vizSearch.value = state.publicRaceSearch;
    }
    if (rciNormCountryFilter) rciNormCountryFilter.value = state.rciNormFilters.country || "";
    if (vizCountryFilter) vizCountryFilter.value = state.rciNormFilters.country || "";
    syncMultiSelectValues(rciNormSeriesFilter, state.rciNormFilters.series);
    syncMultiSelectValues(vizSeriesFilter, state.rciNormFilters.series);
  }

  function rerenderSharedPublicLists() {
    rciNormSearch?.dispatchEvent(new Event("input"));
    vizSearch?.dispatchEvent(new Event("input"));
  }

  async function onSharedPublicFiltersChanged() {
    syncPublicFilterControls();
    rerenderSharedPublicLists();
    await updateRciNormTables();
    await updateVisualization();
  }

  wireRaceFilterPanel({
    listEl: rciNormList,
    searchEl: rciNormSearch,
    countryEl: rciNormCountryFilter,
    seriesEl: rciNormSeriesFilter,
    countEl: document.getElementById("rcinormCount"),
    selectedSet: state.rciNormSelected,
    filters: state.rciNormFilters,
    onUpdate: onSharedPublicFiltersChanged,
    buttonConfigs: [
      ["rcinormAll", () => { setSelectionAll(state.rciNormSelected); applyFiltersToSelection(state.rciNormSelected, state.rciNormFilters); }],
      ["rcinormNone", () => { setSelectionNone(state.rciNormSelected); }],
      ["rcinorm2025", () => { setSelectionByYear(state.rciNormSelected, 2025, state.rciNormFilters); }],
      ["rcinorm2024", () => { setSelectionByYear(state.rciNormSelected, 2024, state.rciNormFilters); }],
      ["rcinorm2023", () => { setSelectionByYear(state.rciNormSelected, 2023, state.rciNormFilters); }]
    ]
  });

  wireRaceFilterPanel({
    listEl: document.getElementById("vizList"),
    searchEl: vizSearch,
    countryEl: vizCountryFilter,
    seriesEl: vizSeriesFilter,
    countEl: document.getElementById("vizCount"),
    selectedSet: state.vizSelected,
    filters: state.vizFilters,
    onUpdate: onSharedPublicFiltersChanged,
    buttonConfigs: [
      ["vizAll", () => { setSelectionAll(state.vizSelected); applyFiltersToSelection(state.vizSelected, state.vizFilters); }],
      ["vizNone", () => { setSelectionNone(state.vizSelected); }],
      ["viz2025", () => { setSelectionByYear(state.vizSelected, 2025, state.vizFilters); }],
      ["viz2024", () => { setSelectionByYear(state.vizSelected, 2024, state.vizFilters); }],
      ["viz2023", () => { setSelectionByYear(state.vizSelected, 2023, state.vizFilters); }]
    ]
  });

  if (rciNormSearch && vizSearch) {
    let syncingSearch = false;
    const syncSearch = (source, target) => {
      if (syncingSearch) return;
      syncingSearch = true;
      state.publicRaceSearch = source.value;
      target.value = source.value;
      target.dispatchEvent(new Event("input"));
      syncingSearch = false;
    };
    rciNormSearch.addEventListener("input", () => syncSearch(rciNormSearch, vizSearch));
    vizSearch.addEventListener("input", () => syncSearch(vizSearch, rciNormSearch));
  }

  syncPublicFilterControls();
  rerenderSharedPublicLists();

  const vizLadderMale = document.getElementById("vizLadderMale");
  const vizLadderFemale = document.getElementById("vizLadderFemale");
  if (vizLadderMale) vizLadderMale.addEventListener("click", () => { setVizLadderSex("male"); updateVisualization(); });
  if (vizLadderFemale) vizLadderFemale.addEventListener("click", () => { setVizLadderSex("female"); updateVisualization(); });
  setVizLadderSex(state.vizLadderSex);

  if (vizTopMenu) {
    vizTopMenu.addEventListener("change", () => {
      if (!vizTopMenu.value) return;
      state.vizType = vizTopMenu.value === "parity" ? "parity" : "ladder";
      setActiveTab("visualization");
      updateVisualization();
    });
  }
  if (vizParityConnect) {
    vizParityConnect.checked = state.vizParityConnect;
    vizParityConnect.addEventListener("change", () => {
      state.vizParityConnect = vizParityConnect.checked;
      updateVisualization();
    });
  }

  const chList = document.getElementById("chartsList");
  const chSearch = document.getElementById("searchCharts");
  const chartsCountryFilter = document.getElementById("chartsCountryFilter");
  const chartsSeriesFilter = document.getElementById("chartsSeriesFilter");
  function renderChartsList() {
    renderCourseList(chList, state.chartsSelected, chSearch.value, { filters: state.chartsFilters });
    document.getElementById("chartsCount").textContent = String(state.chartsSelected.size);
  }
  renderFilterOptions(chartsCountryFilter, chartsSeriesFilter, state.chartsFilters);
  chSearch.addEventListener("input", renderChartsList);

  if (chartsCountryFilter) {
    chartsCountryFilter.addEventListener("change", () => {
      state.chartsFilters.country = chartsCountryFilter.value;
      applyFiltersToSelection(state.chartsSelected, state.chartsFilters);
      renderChartsList();
      updateCharts();
    });
  }

  if (chartsSeriesFilter) {
    chartsSeriesFilter.addEventListener("change", () => {
      state.chartsFilters.series = chartsSeriesFilter.value;
      applyFiltersToSelection(state.chartsSelected, state.chartsFilters);
      renderChartsList();
      updateCharts();
    });
  }

  document.getElementById("chartAll").addEventListener("click", () => {
    setSelectionAll(state.chartsSelected);
    applyFiltersToSelection(state.chartsSelected, state.chartsFilters);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chartNone").addEventListener("click", () => {
    setSelectionNone(state.chartsSelected);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2025").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2025, state.chartsFilters);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2024").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2024, state.chartsFilters);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2023").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2023, state.chartsFilters);
    renderChartsList();
    updateCharts();
  });

  renderChartsList();

  const elTopN = document.getElementById("topN");
  elTopN.value = String(state.topN);
  elTopN.addEventListener("input", () => {
    state.topN = Number(elTopN.value);
    updateCharts();
  });

  wireRciSort("rcifemaleTable", "female", state.rciSorts, updateRciTables);
  wireRciSort("rcimaleTable", "male", state.rciSorts, updateRciTables);
  wireRciSort("rcinormfemaleTable", "female", state.rciNormSorts, updateRciNormTables);
  wireRciSort("rcinormmaleTable", "male", state.rciNormSorts, updateRciNormTables);
  const exportFemale = document.getElementById("exportRciFemaleCsv");
  if (exportFemale) exportFemale.addEventListener("click", () => exportRciCsv("female", {
    selectedSet: state.rciSelected,
    filters: state.rciFilters,
    sorts: state.rciSorts,
    normalizeFemale: false
  }));
  const exportMale = document.getElementById("exportRciMaleCsv");
  if (exportMale) exportMale.addEventListener("click", () => exportRciCsv("male", {
    selectedSet: state.rciSelected,
    filters: state.rciFilters,
    sorts: state.rciSorts,
    normalizeFemale: false
  }));
  const exportNormFemale = document.getElementById("exportRciNormFemaleCsv");
  if (exportNormFemale) exportNormFemale.addEventListener("click", () => exportRciCsv("female", {
    selectedSet: state.rciNormSelected,
    filters: state.rciNormFilters,
    sorts: state.rciNormSorts,
    normalizeFemale: true
  }));
  const exportNormMale = document.getElementById("exportRciNormMaleCsv");
  if (exportNormMale) exportNormMale.addEventListener("click", () => exportRciCsv("male", {
    selectedSet: state.rciNormSelected,
    filters: state.rciNormFilters,
    sorts: state.rciNormSorts,
    normalizeFemale: true
  }));

  document.getElementById("tabSummary").addEventListener("click", () => setActiveTab("summary"));
  document.getElementById("tabCharts").addEventListener("click", () => setActiveTab("charts"));
  document.getElementById("tabRace").addEventListener("click", () => setActiveTab("race"));
  const tabRci = document.getElementById("tabRci");
  if (tabRci) tabRci.addEventListener("click", () => setActiveTab("rcicharts"));
  const tabRciNorm = document.getElementById("tabRciNorm");
  if (tabRciNorm) tabRciNorm.addEventListener("click", () => setActiveTab("rcinormcharts"));
  const tabImport = document.getElementById("tabImport");
  if (tabImport) tabImport.addEventListener("click", () => setActiveTab("import"));

  const importBuild = document.getElementById("importBuildJsonBtn");
  if (importBuild) importBuild.addEventListener("click", buildImportJson);
  const importDownloadRace = document.getElementById("importDownloadRaceBtn");
  if (importDownloadRace) importDownloadRace.addEventListener("click", downloadImportRaceJson);
  const importDownloadIndex = document.getElementById("importDownloadIndexBtn");
  if (importDownloadIndex) importDownloadIndex.addEventListener("click", downloadImportManifestJson);

  const raceSearch = document.getElementById("searchRace");
  const firstRace = getManifestEntries()[0];
  state.raceSelected = firstRace ? firstRace.race_id : null;
  raceSearch.addEventListener("input", () => renderRaceList(raceSearch.value));
  renderRaceList("");

  applyAppModeVisibility(state.appMode);
  setActiveTab(state.activeTab);
  Plotly.newPlot("plot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  Plotly.newPlot(
    "lorenzPlot",
    [{ x: [0, 1], y: [0, 1], mode: "lines", name: "Equality", line: { width: 2, dash: "dot" }, hoverinfo: "skip" }],
    { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" },
    { responsive: true, displayModeBar: false }
  );
  Plotly.newPlot("heatmapPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  Plotly.newPlot("vizLadderPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  Plotly.newPlot("vizParityPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });

  await updateAll();
  await updateRaceDisplay();
})();
