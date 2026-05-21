import { state, TAB_ALLOWLIST, DEFAULT_TAB_BY_MODE } from './state.js';
import { renderPublicRciTable } from './render-public.js';
import { updateVisualization, updateCharts } from './charts.js';

export function getAppContext() {
  const path = window.location.pathname || "/";
  const isAdmin =
    path === "/admin" || path === "/admin/" ||
    path.endsWith("/admin/index.html") || path.endsWith("/admin");
  return { mode: isAdmin ? "admin" : "public" };
}

export function isTabAllowed(mode, tab) {
  return (TAB_ALLOWLIST[mode] || []).includes(tab);
}

export function getSafeTab(mode, desiredTab) {
  if (isTabAllowed(mode, desiredTab)) return desiredTab;
  return DEFAULT_TAB_BY_MODE[mode] || "rcinormcharts";
}

export function applyAppModeVisibility(mode) {
  const publicButtons = ["tabRciNorm", "vizTabParity", "tabCharts"];
  const adminButtons = ["tabRace", "tabImport", "tabDiscover", "tabBulk"];
  const publicPages = ["pageRciNorm", "pageViz", "pageCharts"];
  const adminPages = ["pageRace", "pageImport", "pageDiscover", "pageBulk"];

  const hide = (id, hidden) => { const el = document.getElementById(id); if (el) el.hidden = hidden; };
  const isAdmin = mode === "admin";
  for (const id of publicButtons) hide(id, isAdmin);
  for (const id of adminButtons) hide(id, !isAdmin);
  for (const id of publicPages) hide(id, isAdmin);
  for (const id of adminPages) hide(id, !isAdmin);
}

export function setActiveTab(tab) {
  const safeTab = getSafeTab(state.appMode, tab);
  state.activeTab = safeTab;

  const pageMap = {
    rcinormcharts: "pageRciNorm",
    visualization: "pageViz",
    charts: "pageCharts",
    race: "pageRace",
    import: "pageImport",
    discover: "pageDiscover",
    bulk: "pageBulk"
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
  document.getElementById("tabDiscover")?.classList.toggle("active", safeTab === "discover");
  document.getElementById("tabBulk")?.classList.toggle("active", safeTab === "bulk");

  if (safeTab === "visualization") updateVisualization();
  if (safeTab === "charts") updateCharts();
}

export async function updateAll() {
  await renderPublicRciTable();
}

export function readHashParams() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return {};
    const p = new URLSearchParams(hash);
    const yearsRaw = p.get("years");
    const seriesRaw = p.get("series");
    return {
      tab: p.get("tab") || null,
      gender: p.get("gender") || null,
      years: yearsRaw ? yearsRaw.split(",").map(Number).filter(y => y > 0) : null,
      series: seriesRaw ? seriesRaw.split(",").filter(Boolean) : null,
      country: p.get("country") || null,
    };
  } catch { return {}; }
}

export function writeHashParams(params) {
  const p = new URLSearchParams();
  if (params.tab) p.set("tab", params.tab);
  if (params.gender) p.set("gender", params.gender);
  if (params.years?.length) p.set("years", params.years.join(","));
  if (params.series?.length) p.set("series", params.series.join(","));
  if (params.country) p.set("country", params.country);
  const str = p.toString();
  history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
}
