// Trail Race Analytics — entry point
import { state, DEFAULT_TAB_BY_MODE } from './state.js';
import { loadManifest, preloadAllCourseMeta, getManifestEntries, loadCourse } from './data.js';
import { renderPublicRciTable, wirePublicChipFilters, setSelectionByYear, exportRciCsv } from './render-public.js';
import { updateVisualization, updateCharts } from './charts.js';
import { getAppContext, applyAppModeVisibility, setActiveTab, updateAll } from './navigation.js';
import { fetchFromItra, buildImportJson, importToSupabase, downloadImportRaceJson, downloadImportManifestJson } from './import-itra.js';
import { parseBulkCsvAction, startBulkImport } from './bulk-import.js';
import { renderRaceList, renderRaceEditForm, updateRaceDisplay } from './render-admin.js';
import { discoverSearch, feedDiscoverToBulk } from './discover.js';

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
  }

  // Nav tabs
  document.getElementById("tabRciNorm")?.addEventListener("click", () => setActiveTab("rcinormcharts"));
  document.getElementById("vizTabParity")?.addEventListener("click", () => setActiveTab("visualization"));
  document.getElementById("tabCharts")?.addEventListener("click", () => setActiveTab("charts"));
  document.getElementById("tabRace")?.addEventListener("click", () => setActiveTab("race"));
  document.getElementById("tabImport")?.addEventListener("click", () => setActiveTab("import"));
  document.getElementById("tabDiscover")?.addEventListener("click", () => setActiveTab("discover"));
  document.getElementById("tabBulk")?.addEventListener("click", () => setActiveTab("bulk"));
  document.getElementById("discoverSearchBtn")?.addEventListener("click", discoverSearch);
  document.getElementById("discoverFeedBtn")?.addEventListener("click", feedDiscoverToBulk);

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

  // Admin: bulk CSV import
  document.getElementById("bulkParseCsvBtn")?.addEventListener("click", parseBulkCsvAction);
  document.getElementById("bulkStartBtn")?.addEventListener("click", startBulkImport);

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
