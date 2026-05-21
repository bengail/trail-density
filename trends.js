import { getManifestEntries } from './data.js';
import { rciFromResults } from './lib/rci.js';

export function getDistinctSlugs() {
  const slugs = new Set();
  for (const entry of getManifestEntries()) {
    if (entry.race_slug) slugs.add(entry.race_slug);
  }
  return [...slugs].sort();
}

export async function loadTrendData(raceSlug) {
  const { data: courses, error: ce } = await window.supabaseClient
    .from("courses").select("id, year").eq("race_slug", raceSlug).order("year");
  if (ce) throw new Error("Supabase trends courses: " + ce.message);
  if (!courses?.length) return {};

  const courseIds = courses.map(c => c.id);
  const { data: results, error: re } = await window.supabaseClient
    .from("results").select("course_id, rank, index, gender")
    .in("course_id", courseIds);
  if (re) throw new Error("Supabase trends results: " + re.message);

  const yearById = Object.fromEntries(courses.map(c => [c.id, c.year]));
  const byYear = {};
  for (const r of results) {
    const year = yearById[r.course_id];
    if (!year) continue;
    if (!byYear[year]) byYear[year] = { M: [], F: [] };
    const g = r.gender === "F" ? "F" : "M";
    byYear[year][g].push({ rank: Number(r.rank), index: Number(r.index) });
  }
  return byYear;
}

export function buildTrendTraces(byYear, gender = "both") {
  const years = Object.keys(byYear).map(Number).sort();
  if (!years.length) return [];

  const palette = {
    F5:  '#e91e8c', F10: '#f472b6',
    M5:  '#2563eb', M10: '#7dd3fc',
  };

  const genders = gender === "both" ? ["F", "M"] : [gender === "female" ? "F" : "M"];
  const traces = [];

  for (const n of [5, 10]) {
    for (const g of genders) {
      const x = [], y = [];
      for (const yr of years) {
        const rci = rciFromResults(byYear[yr][g] || [], n);
        if (Number.isFinite(rci)) { x.push(yr); y.push(Math.round(rci * 10) / 10); }
      }
      if (!x.length) continue;
      const label = `${g === "F" ? "Women" : "Men"} RCI${n}`;
      traces.push({
        x, y,
        mode: "lines+markers",
        name: label,
        line: { color: palette[`${g}${n}`], width: 2, dash: n === 10 ? "dot" : "solid" },
        marker: { size: 7 },
      });
    }
  }
  return traces;
}

export function renderTrendsChart(byYear, gender = "both") {
  const div = document.getElementById("trendPlot");
  if (!div) return;

  const traces = buildTrendTraces(byYear, gender);
  if (!traces.length) {
    div.innerHTML = '<div class="note" style="padding:20px">No data for this race.</div>';
    return;
  }

  Plotly.newPlot(div, traces, {
    xaxis: { title: "Year", tickformat: "d", dtick: 1 },
    yaxis: { title: "RCI" },
    legend: { orientation: "h", y: -0.2 },
    margin: { t: 20, r: 20, b: 80, l: 55 },
    plot_bgcolor: "transparent",
    paper_bgcolor: "transparent",
    font: { family: "Montserrat, sans-serif", size: 12 },
  }, { responsive: true });
}

export function wireTrendsTab() {
  const input = document.getElementById("trendsSlugInput");
  const suggest = document.getElementById("trendsSlugSuggest");
  const plotDiv = document.getElementById("trendPlot");
  let currentGender = "both";

  // Populate datalist
  const slugs = getDistinctSlugs();
  if (suggest) {
    suggest.innerHTML = slugs.map(s => `<option value="${s}">`).join("");
  }

  const doSearch = async () => {
    const slug = input?.value?.trim().toUpperCase();
    if (!slug) return;
    if (plotDiv) plotDiv.innerHTML = '<div class="note" style="padding:20px">Loading…</div>';
    const title = document.getElementById("trendsTitle");
    if (title) title.textContent = slug.replace(/_/g, " ");
    try {
      const byYear = await loadTrendData(slug);
      if (!Object.keys(byYear).length) {
        if (plotDiv) plotDiv.innerHTML = '<div class="note" style="padding:20px">No data found for this race.</div>';
        return;
      }
      renderTrendsChart(byYear, currentGender);
      // Store for gender toggle re-renders
      input._byYear = byYear;
    } catch (e) {
      if (plotDiv) plotDiv.innerHTML = `<div class="note" style="padding:20px; color:#dc2626">${e.message}</div>`;
    }
  };

  document.getElementById("trendsSearchBtn")?.addEventListener("click", doSearch);
  input?.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  const setGender = (g) => {
    currentGender = g;
    document.getElementById("trendsGenderBoth")?.classList.toggle("active", g === "both");
    document.getElementById("trendsGenderWomen")?.classList.toggle("active", g === "female");
    document.getElementById("trendsGenderMen")?.classList.toggle("active", g === "male");
    if (input?._byYear) renderTrendsChart(input._byYear, g);
  };

  document.getElementById("trendsGenderBoth")?.addEventListener("click", () => setGender("both"));
  document.getElementById("trendsGenderWomen")?.addEventListener("click", () => setGender("female"));
  document.getElementById("trendsGenderMen")?.addEventListener("click", () => setGender("male"));
}
