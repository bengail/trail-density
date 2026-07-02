import { state, PARITY_N_LEVELS } from './state.js';
import { loadCourse, getCourseLabel } from './data.js';
import { inferRaceGender, normalizeSeries, filterResultsByGender, getRciResultsForMode } from './lib/normalize.js';
import { getTopStats } from './lib/rci.js';

export function getVizFilteredIds() {
  return Array.from(state.vizSelected).sort();
}

export async function getVizRciPoints(options = {}) {
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

export async function renderParityVisualization() {
  const plotEl = document.getElementById("vizParityPlot");
  if (!plotEl) return;

  const noData = (msg) => Plotly.react("vizParityPlot", [], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    annotations: [{ x: 0.5, y: 0.5, xref: "paper", yref: "paper", text: msg, showarrow: false, font: { color: "#64748b", size: 13 } }]
  }, { responsive: true, displayModeBar: false });

  const n = state.parityN;
  const points = await getVizRciPoints({ nLevels: [n] });

  const byRace = new Map();
  for (const p of points) {
    if (!byRace.has(p.race_id)) byRace.set(p.race_id, { name: p.race_name, male: NaN, female: NaN });
    byRace.get(p.race_id)[p.sex] = p.rci;
  }

  const races = Array.from(byRace.values()).filter(r => Number.isFinite(r.male) && Number.isFinite(r.female));
  if (!races.length) { noData("No races with both genders and ≥ N results"); return; }

  races.sort((a, b) => (b.female - b.male) - (a.female - a.male));

  const deltas = races.map(r => r.female - r.male);
  const colors = deltas.map(d => d >= 0 ? "#10b981" : "#3b82f6");

  Plotly.react("vizParityPlot", [{
    type: "bar", orientation: "h",
    x: deltas, y: races.map(r => r.name),
    marker: { color: colors },
    hovertemplate: "<b>%{y}</b><br>Δ RCI = %{x:.1f}<extra></extra>"
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 160, r: 40, t: 10, b: 50 },
    font: { family: "Montserrat, ui-sans-serif, system-ui, sans-serif", size: 11 },
    xaxis: { title: `RCI${n} female − male`, gridcolor: "#e2e8f0", zeroline: true, zerolinecolor: "#cbd5e1", zerolinewidth: 1.5 },
    yaxis: { automargin: true, tickfont: { size: 10 } }
  }, { responsive: true, displayModeBar: false });
}

export async function updateVisualization() {
  const el = document.getElementById("vizCount");
  if (el) el.textContent = String(state.rciNormSelected.size);
  await renderParityVisualization();
}

export function groupForCharts(courses, topN, gender = "both") {
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

export function updateRankPlot(grouped, topN) {
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

  Plotly.react("plot", traces, {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 55, r: 160, t: 10, b: 50 },
    font: { family: "Montserrat, ui-sans-serif, system-ui, sans-serif", size: 11 },
    xaxis: { title: "Rank", range: [1, topN], gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
    yaxis: { title: "ITRA Index", gridcolor: "#e2e8f0", zeroline: false, tickfont: { size: 10 } },
    legend: { orientation: "v", x: 1.02, y: 1, xanchor: "left", font: { size: 10 }, bgcolor: "rgba(255,255,255,0.85)", bordercolor: "#e2e8f0", borderwidth: 1 },
    hovermode: "closest"
  }, { responsive: true, displayModeBar: false });
}

export async function updateCharts() {
  const el = document.getElementById("chartsVizCount");
  if (el) el.textContent = String(state.rciNormSelected.size);
  const topN = state.topN;
  const ids = Array.from(state.rciNormSelected).sort();
  const courses = await Promise.all(ids.map(id => loadCourse(id).catch(() => null)));
  const grouped = groupForCharts(courses.filter(Boolean), topN, state.chartsGender);
  updateRankPlot(grouped, topN);
}
