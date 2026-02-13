// Trail Race Analytics v2 (JSON-based)
// Loads data/courses_index.json then fetches per-course JSON on demand.
// Produces: summary table + rank curve + Lorenz + decile heatmap.

const MAX_INDEX_FOR_NORM = 1000; // used for AUC normalization (matches earlier convention)

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
  const resp = await fetch("data/courses_index.json", { cache: "no-store" });
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
  const resp = await fetch(entry.path, { cache: "no-store" });
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
  summarySort: { key: "rci10", dir: "desc" },
  summarySelected: new Set(),
  chartsSelected: new Set(),
  topN: 30,
  summaryFilters: { country: "", series: "" },
  chartsFilters: { country: "", series: "" },
  raceSelected: null
};

function matchesFilters(meta, filters) {
  const countryOk = !filters.country || (meta?.country || "") === filters.country;
  const seriesOk = !filters.series || normalizeSeries(meta?.series).includes(filters.series);
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
      updateAll();
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
  const seriesOptions = ['<option value="">All series</option>']
    .concat(Array.from(seriesValues).sort().map(v => `<option value="${v}">${v}</option>`))
    .join("");

  countrySelect.innerHTML = countryOptions;
  seriesSelect.innerHTML = seriesOptions;
  countrySelect.value = filters.country;
  seriesSelect.value = filters.series;
}

// ---- Metrics ----
function topScores(course, n) {
  return course.results.filter(r => r.rank >= 1 && r.rank <= n).map(r => r.index);
}

function rci(course, n) {
  const s = topScores(course, n);
  if (!s.length) return NaN;
  return mean(s) - stdPop(s);
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
    const arr = grouped.get(id) || [];
    const dec = bucketMeansByRank(arr, ranges);
    z.push(dec.map(v => (Number.isFinite(v) ? v : null)));
    y.push(id);
  }
  Plotly.react(
    "heatmapPlot",
    [
      {
        type: "heatmap",
        x: xLabels,
        y: y,
        z: z,
        hovertemplate: "Course=%{y}<br>Decile=%{x}<br>Mean=%{z:.1f}<extra></extra>"
      }
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 95, r: 20, t: 10, b: 55 },
      xaxis: { title: "Rank deciles (means)" },
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
  const sum = document.getElementById("pageSummary");
  const cha = document.getElementById("pageCharts");
  const race = document.getElementById("pageRace");
  const bSum = document.getElementById("tabSummary");
  const bCha = document.getElementById("tabCharts");
  const bRace = document.getElementById("tabRace");

  if (tab === "summary") {
    sum.classList.add("active");
    cha.classList.remove("active");
    race.classList.remove("active");
    bSum.classList.add("active");
    bCha.classList.remove("active");
    bRace.classList.remove("active");
  } else if (tab === "charts") {
    cha.classList.add("active");
    sum.classList.remove("active");
    race.classList.remove("active");
    bCha.classList.add("active");
    bSum.classList.remove("active");
    bRace.classList.remove("active");
  } else {
    race.classList.add("active");
    sum.classList.remove("active");
    cha.classList.remove("active");
    bRace.classList.add("active");
    bSum.classList.remove("active");
    bCha.classList.remove("active");
  }
}

// ---- Orchestrator ----
async function updateAll() {
  await updateSummaryTable();
  await updateCharts();
}

// ---- Boot ----
(async function boot() {
  await loadManifest();
  await preloadAllCourseMeta();

  setSelectionAll(state.summarySelected);
  setSelectionAll(state.chartsSelected);

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

  document.getElementById("tabSummary").addEventListener("click", () => setActiveTab("summary"));
  document.getElementById("tabCharts").addEventListener("click", () => setActiveTab("charts"));
  document.getElementById("tabRace").addEventListener("click", () => setActiveTab("race"));

  const raceSearch = document.getElementById("searchRace");
  const firstRace = getManifestEntries()[0];
  state.raceSelected = firstRace ? firstRace.race_id : null;
  raceSearch.addEventListener("input", () => renderRaceList(raceSearch.value));
  renderRaceList("");

  Plotly.newPlot("plot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  Plotly.newPlot(
    "lorenzPlot",
    [{ x: [0, 1], y: [0, 1], mode: "lines", name: "Equality", line: { width: 2, dash: "dot" }, hoverinfo: "skip" }],
    { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" },
    { responsive: true, displayModeBar: false }
  );
  Plotly.newPlot("heatmapPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });

  await updateAll();
  await updateRaceDisplay();
})();
