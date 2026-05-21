export const TAB_ALLOWLIST = {
  public: ["rcinormcharts", "visualization", "charts"],
  admin: ["race", "import", "discover", "bulk"]
};

export const DEFAULT_TAB_BY_MODE = {
  public: "rcinormcharts",
  admin: "race"
};

export const PARITY_N_LEVELS = [5, 10, 20];

export const state = {
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
  importDraft: null,
  bulkRows: [],
  bulkRunning: false,
  discoverRaces: []
};

// Viz tab shares selection with RCI tab
state.vizSelected = state.rciNormSelected;
state.vizFilters = state.rciNormFilters;
