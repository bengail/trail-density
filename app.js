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

function decileMeansByRank(results, topN) {
  // returns 10 buckets for 1-10..91-100; buckets beyond topN become null
  const out = [];
  for (let start = 1; start <= 100; start += 10) {
    const end = start + 9;
    if (start > topN) {
      out.push(null);
      continue;
    }
    const bucket = results
      .filter(r => r.rank >= start && r.rank <= Math.min(end, topN))
      .map(r => r.index);
    out.push(bucket.length ? mean(bucket) : null);
  }
  return out;
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
  topN: 100,
  summaryFilters: { country: "", series: "" }
};

function matchesSummaryFilters(meta) {
  const countryOk = !state.summaryFilters.country || (meta?.country || "") === state.summaryFilters.country;
  const seriesOk = !state.summaryFilters.series || normalizeSeries(meta?.series).includes(state.summaryFilters.series);
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
    if (options.applySummaryFilters && !matchesSummaryFilters(meta)) continue;

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
    label.innerHTML = `<code>${id}</code>`;

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = getMetaLabel(meta);

    div.appendChild(cb);
    div.appendChild(label);
    div.appendChild(pill);
    targetEl.appendChild(div);
  }
}

function setSelectionByYear(selectedSet, year) {
  selectedSet.clear();
  for (const c of getManifestEntries()) {
    const meta = getCourseMeta(c.race_id);
    if (meta?.year === year) selectedSet.add(c.race_id);
  }
}

function setSelectionAll(selectedSet) {
  selectedSet.clear();
  for (const c of getManifestEntries()) selectedSet.add(c.race_id);
}

function setSelectionNone(selectedSet) {
  selectedSet.clear();
}

function applySummaryFiltersToSelection() {
  for (const id of Array.from(state.summarySelected)) {
    const meta = getCourseMeta(id);
    if (!matchesSummaryFilters(meta)) state.summarySelected.delete(id);
  }
}

function renderSummaryFilterOptions() {
  const countrySelect = document.getElementById("summaryCountryFilter");
  const seriesSelect = document.getElementById("summarySeriesFilter");
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
  countrySelect.value = state.summaryFilters.country;
  seriesSelect.value = state.summaryFilters.series;
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

function aucNormTop100(course, topN = 100) {
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
    if (!matchesSummaryFilters(meta)) continue;

    const top3 = mean(topScores(course, 3));
    const top5 = mean(topScores(course, 5));
    const top10Arr = topScores(course, 10);
    const top10 = mean(top10Arr);
    const top10Std = stdPop(top10Arr);
    const series = normalizeSeries(meta.series).join(", ");

    rows.push({
      id,
      year: meta.year ?? null,
      series: series || "",
      country: meta.country || "",
      src: meta.data_source || "",
      top3,
      top5,
      top10,
      rci10: rci(course, 10),
      rci20: rci(course, 20),
      rci30: rci(course, 30),
      top10Std,
      aucNorm: aucNormTop100(course, 100),
      gini: gini(course.results.filter(r => r.rank >= 1 && r.rank <= 100).map(r => r.index))
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
      <td><code>${r.id}</code></td>
      <td>${r.year ?? "-"}</td>
      <td>${r.series || "-"}</td>
      <td>${r.country || "-"}</td>
      <td>${r.src || "-"}</td>
      <td>${fmt(r.top3, 1)}</td>
      <td>${fmt(r.top5, 1)}</td>
      <td>${fmt(r.top10, 1)}</td>
      <td>${fmt(r.rci10, 2)}</td>
      <td>${fmt(r.rci20, 2)}</td>
      <td>${fmt(r.rci30, 2)}</td>
      <td>${fmt(r.top10Std, 2)}</td>
      <td>${fmt(r.aucNorm, 4)}</td>
      <td>${fmt(r.gini, 4)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById("summaryCount").textContent = String(state.summarySelected.size);
}

// ---- Charts ----
function groupForCharts(courses, topN) {
  const grouped = new Map();
  for (const c of courses) {
    const id = c.meta?.race_id || c.race_id;
    const arr = (c.results || [])
      .filter(r => r.rank >= 1 && r.rank <= topN)
      .sort((a, b) => a.rank - b.rank);
    grouped.set(id, arr);
  }
  return grouped;
}

function updateRankPlot(grouped, topN) {
  const ids = Array.from(grouped.keys()).sort();
  const traces = ids.map(id => {
    const arr = grouped.get(id) || [];
    return {
      x: arr.map(r => r.rank),
      y: arr.map(r => r.index),
      mode: "lines+markers",
      name: id,
      hovertemplate: `${id}<br>rank=%{x}<br>index=%{y:.1f}<extra></extra>`,
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
      xaxis: { title: "Rang (Top N)", range: [1, topN], gridcolor: "rgba(255,255,255,.06)", zeroline: false },
      yaxis: { title: "Index (Race Score)", gridcolor: "rgba(255,255,255,.06)", zeroline: false },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11 } },
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
      name: "Egalite (repartition parfaite)",
      line: { width: 2, dash: "dot" },
      hoverinfo: "skip"
    }
  ];

  const ids = Array.from(grouped.keys()).sort();
  for (const id of ids) {
    const arr = grouped.get(id) || [];
    const values = arr.map(r => r.index);
    const G = gini(values);
    const L = lorenzPoints(values);
    traces.push({
      x: L.x,
      y: L.y,
      mode: "lines",
      name: `${id} (Gini=${fmt(G, 4)})`,
      hovertemplate: `${id}<br>% athletes=%{x:.2f}<br>% index=%{y:.2f}<extra></extra>`,
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
      xaxis: { title: "% cumulative athletes (low to high)", range: [0, 1], gridcolor: "rgba(255,255,255,.06)", zeroline: false },
      yaxis: { title: "% cumulative index", range: [0, 1], gridcolor: "rgba(255,255,255,.06)", zeroline: false },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11 } },
      hovermode: "closest"
    },
    { responsive: true, displayModeBar: false }
  );
}

function updateHeatmap(grouped, topN) {
  const ids = Array.from(grouped.keys()).sort();
  const xLabels = ["1-10", "11-20", "21-30", "31-40", "41-50", "51-60", "61-70", "71-80", "81-90", "91-100"];
  const z = [];
  const y = [];
  for (const id of ids) {
    const arr = grouped.get(id) || [];
    const dec = decileMeansByRank(arr, topN);
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

// ---- Page switching ----
function setActiveTab(tab) {
  const sum = document.getElementById("pageSummary");
  const cha = document.getElementById("pageCharts");
  const bSum = document.getElementById("tabSummary");
  const bCha = document.getElementById("tabCharts");

  if (tab === "summary") {
    sum.classList.add("active");
    cha.classList.remove("active");
    bSum.classList.add("active");
    bCha.classList.remove("active");
  } else {
    cha.classList.add("active");
    sum.classList.remove("active");
    bCha.classList.add("active");
    bSum.classList.remove("active");
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
    renderCourseList(sumList, state.summarySelected, sumSearch.value, { applySummaryFilters: true });
  }

  renderSummaryFilterOptions();
  sumSearch.addEventListener("input", renderSummaryList);

  if (summaryCountryFilter) {
    summaryCountryFilter.addEventListener("change", () => {
      state.summaryFilters.country = summaryCountryFilter.value;
      applySummaryFiltersToSelection();
      renderSummaryList();
      updateSummaryTable();
    });
  }

  if (summarySeriesFilter) {
    summarySeriesFilter.addEventListener("change", () => {
      state.summaryFilters.series = summarySeriesFilter.value;
      applySummaryFiltersToSelection();
      renderSummaryList();
      updateSummaryTable();
    });
  }

  document.getElementById("sumAll").addEventListener("click", () => {
    setSelectionAll(state.summarySelected);
    applySummaryFiltersToSelection();
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sumNone").addEventListener("click", () => {
    setSelectionNone(state.summarySelected);
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2025").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2025);
    applySummaryFiltersToSelection();
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2024").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2024);
    applySummaryFiltersToSelection();
    renderSummaryList();
    updateAll();
  });
  document.getElementById("sum2023").addEventListener("click", () => {
    setSelectionByYear(state.summarySelected, 2023);
    applySummaryFiltersToSelection();
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
  function renderChartsList() {
    renderCourseList(chList, state.chartsSelected, chSearch.value);
    document.getElementById("chartsCount").textContent = String(state.chartsSelected.size);
  }
  chSearch.addEventListener("input", renderChartsList);

  document.getElementById("chartAll").addEventListener("click", () => {
    setSelectionAll(state.chartsSelected);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chartNone").addEventListener("click", () => {
    setSelectionNone(state.chartsSelected);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2025").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2025);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2024").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2024);
    renderChartsList();
    updateCharts();
  });
  document.getElementById("chart2023").addEventListener("click", () => {
    setSelectionByYear(state.chartsSelected, 2023);
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

  Plotly.newPlot("plot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });
  Plotly.newPlot(
    "lorenzPlot",
    [{ x: [0, 1], y: [0, 1], mode: "lines", name: "Egalite", line: { width: 2, dash: "dot" }, hoverinfo: "skip" }],
    { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" },
    { responsive: true, displayModeBar: false }
  );
  Plotly.newPlot("heatmapPlot", [], { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" }, { responsive: true, displayModeBar: false });

  await updateAll();
})();
