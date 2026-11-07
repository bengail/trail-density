// FR / EN strings and locale-aware formatting. The language is always part of the URL (/fr/…, /en/…).
export type Lang = "fr" | "en";
export const LANGS: Lang[] = ["fr", "en"];

const STRINGS = {
  fr: {
    tagline: "L'indice de compétitivité du trail",
    nav_rankings: "Classement",
    nav_compare: "Comparer",
    nav_method: "Méthode",
    women: "Femmes",
    men: "Hommes",
    rci_help: "RCI10 : moyenne de l'index ITRA du top 10, moins leur dispersion. L'index des femmes est d'abord ramené à l'échelle des hommes. Plus le RCI est haut, plus le plateau est relevé et homogène.",
    learn_more: "En savoir plus",
    rank_in_format: (rank: number, of: number, format: string) => `${ordinal("fr", rank)} sur ${of} courses ${format}`,
    rank_in_catalog: (rank: number, of: number) => `${ordinal("fr", rank)} sur ${of} courses du catalogue`,
    vs_last: (d: string, year: number) => `${d} vs ${year}`,
    history: "Évolution du niveau",
    history_sub: "RCI10 de chaque édition",
    edition: "Édition",
    density: "Courbe de densité",
    density_sub: "Index des 50 premiers, rang par rang. Une courbe haute et plate = un plateau dense.",
    field: "Le peloton",
    field_sub: "Répartition de l'index de tous les finishers",
    depth: "Profondeur",
    above: (t: string) => `index ≥ ${t}`,
    above_mapped: (t: string) => `ramené ≥ ${t}`,
    gap: "Écart 1er – 10e",
    gap_women: "Écart 1re – 10e",
    depth_note: "Côté femmes, ces chiffres utilisent l'index ramené à l'échelle des hommes.",
    finishers: "finishers",
    top10: "Top 10",
    rank: "Rg",
    runner: "Coureur",
    time: "Temps",
    index: "Index",
    published: "Publié",
    mapped: "Ramené",
    no_rci: "pas de RCI10 (moins de 10 finishers)",
    compare_with: "Comparer avec…",
    source: (s: string) => `Source : ${s}`,
    not_enough: "Moins de 10 finishers avec un index : pas de RCI10.",
    points: "pts",
    formats: { vertical: "verticales", short: "courtes (< 30 km)", medium: "moyennes (30–60 km)", long: "longues (60–120 km)", ultra: "ultra (≥ 120 km)" },
    format_label: { vertical: "Vertical", short: "Court", medium: "Moyen", long: "Long", ultra: "Ultra" },
    all_races: "Toutes les courses",
    footer: "Données ITRA et UTMB, recalculées à chaque import.",
    source_label: "Source",
    alt_legend: (label: string) => `pointillés : ${label}`,
    scales_differ: "Index ITRA et UTMB Index sont deux barèmes différents : leurs RCI ne se comparent pas entre eux.",
    raw_note: "« Publié » est l'index d'origine des femmes. « Ramené » le place sur l'échelle des hommes : c'est lui qui sert au RCI et aux graphiques.",
    no_source: (src: string) => `Pas de résultats ${src} pour cette édition.`,
    no_rows: "Aucune course pour ce filtre.",
    home_title: "Quels trails ont les plateaux les plus relevés ?",
    home_sub: "Le RCI mesure le niveau et la densité des premières femmes et des premiers hommes de chaque course. L'index des femmes est ramené à l'échelle des hommes, pour comparer les deux.",
    method_link: "Comment c'est calculé",
    credit: "Indice créé par Travis Loncar (Freetrail)",
    latest_title: "Les plus relevées",
    latest_sub: "RCI10 de la dernière édition de chaque course",
    by_format: "Par format",
    risers: "Plus fortes progressions",
    risers_sub: "Dernière édition comparée à la précédente",
    see_all: "Classement complet",
    rankings_title: "Classement",
    rankings_sub: "RCI10 de chaque course, femmes et hommes classés séparément.",
    season: "Saison",
    latest_edition: "Dernière édition",
    all_formats: "Tous",
    compare_title: "Comparer",
    compare_sub: "Jusqu'à 4 courses, chacune à sa dernière édition.",
    compare_search: "Ajouter une course…",
    compare_full: "4 courses au maximum",
    compare_remove: (name: string) => `Retirer ${name}`,
    compare_suggest: "Suggestions",
    compare_pick: "Ajoutez au moins une course pour comparer.",
    verdict: (g: string, name: string, v: string, gap: string | null) => `${g} : ${name} est la plus relevée (RCI10 ${v}${gap ? `, ${gap} sur la suivante` : ""}).`,
    face_off: "Face à face",
    face_off_sub: "RCI10 de la dernière édition",
    details: "En détail",
    details_sub: "Dernière édition de chaque course",
    n_index: "Finishers avec index",
    mean10: "Moyenne top 10",
    median10: "Médiane top 10",
    no_data: "–",
    method_title: "Méthode",
    method_sub: "Comment le RCI est calculé, d'où viennent les données, et ce qu'il ne dit pas.",
    nav_records: "Records",
    records_title: "Records",
    records_sub: "Les plateaux les plus relevés depuis 2005, d'après le RCI10.",
    records_alltime: "Les plus relevés de l'histoire",
    records_alltime_sub: "Toutes éditions confondues",
    records_broken: (season: number) => `Records tombés en ${season}`,
    records_broken_sub: (min: number) => `Dernière édition au-dessus de toutes les précédentes (au moins ${min} éditions), avec la marge sur l'ancien record`,
    records_prev: (v: string, year: number) => `ancien record : ${v} (${year})`,
    records_rises: "Les plus gros bonds",
    records_rises_sub: "D'une édition à la suivante. Les scores viennent des temps : un bond peut aussi tenir à la météo ou à un changement de parcours.",
    records_each: "Le record de chaque course",
    records_each_sub: "Meilleure édition de chaque course. À droite, l'écart de la dernière édition avec ce record.",
    nav_me: "Et moi ?",
    me_title: "Où te situes-tu ?",
    me_sub: "Entre ton index : voici la place qu'il t'aurait donnée à la dernière édition de chaque course.",
    me_cta: "Et toi, où serais-tu arrivé ?",
    me_index: "Ton index",
    me_scale: "Barème",
    me_gender: "Classement",
    me_both: "Les deux",
    me_where: "Ton index est sur ta fiche itra.run ou utmb.world. Chaque barème se lit sur les courses qui ont ses résultats.",
    me_summary: (n: number, podiums: number, top10: number, half: number) =>
      `Sur ${n} course${n > 1 ? "s" : ""} : ${podiums} podium${podiums > 1 ? "s" : ""}, ${top10} top 10, ${half} dans la première moitié.`,
    me_of: "sur",
    me_top: (pct: number) => `top ${pct} %`,
    me_gap: (pts: number) => `${pts} pt${pts > 1 ? "s" : ""} du top 10`,
    me_missing: (n: number, scale: string) => `${n} course${n > 1 ? "s" : ""} sans résultats ${scale} complets ne ${n > 1 ? "sont" : "est"} pas ${n > 1 ? "listées" : "listée"}.`,
    me_note: "Le score d'une course vient de ton temps, comme l'index : ces places supposent une performance égale à ton index ce jour-là. Seuls les finishers comptent.",
  },
  en: {
    tagline: "The trail running competitiveness index",
    nav_rankings: "Rankings",
    nav_compare: "Compare",
    nav_method: "Method",
    women: "Women",
    men: "Men",
    rci_help: "RCI10: mean ITRA index of the top 10, minus their spread. Women's index is first mapped onto the men's scale. The higher the RCI, the stronger and deeper the field.",
    learn_more: "Learn more",
    rank_in_format: (rank: number, of: number, format: string) => `${ordinal("en", rank)} of ${of} ${format} races`,
    rank_in_catalog: (rank: number, of: number) => `${ordinal("en", rank)} of ${of} races in the catalogue`,
    vs_last: (d: string, year: number) => `${d} vs ${year}`,
    history: "Field strength over time",
    history_sub: "RCI10 of each edition",
    edition: "Edition",
    density: "Density curve",
    density_sub: "Index of the top 50, rank by rank. A high, flat curve = a deep field.",
    field: "The whole field",
    field_sub: "Index distribution of all finishers",
    depth: "Depth",
    above: (t: string) => `index ≥ ${t}`,
    above_mapped: (t: string) => `mapped ≥ ${t}`,
    gap: "Gap 1st – 10th",
    gap_women: "Gap 1st – 10th",
    depth_note: "For women, these figures use the index mapped onto the men's scale.",
    finishers: "finishers",
    top10: "Top 10",
    rank: "#",
    runner: "Runner",
    time: "Time",
    index: "Index",
    compare_with: "Compare with…",
    source: (s: string) => `Source: ${s}`,
    not_enough: "Fewer than 10 finishers with an index: no RCI10.",
    published: "Published",
    mapped: "Mapped",
    no_rci: "no RCI10 (fewer than 10 finishers)",
    points: "pts",
    formats: { vertical: "vertical", short: "short (< 30 km)", medium: "mid-distance (30–60 km)", long: "long (60–120 km)", ultra: "ultra (≥ 120 km)" },
    format_label: { vertical: "Vertical", short: "Short", medium: "Mid", long: "Long", ultra: "Ultra" },
    all_races: "All races",
    footer: "ITRA and UTMB data, recomputed at every import.",
    source_label: "Source",
    alt_legend: (label: string) => `dashed: ${label}`,
    scales_differ: "ITRA index and UTMB Index are two different scales: their RCIs are not comparable with each other.",
    raw_note: "“Published” is women's original index. “Mapped” places it on the men's scale: this is the one used for RCI and the charts.",
    no_source: (src: string) => `No ${src} results for this edition.`,
    no_rows: "No race for this filter.",
    home_title: "Which trail races have the strongest fields?",
    home_sub: "RCI measures how strong and how deep the front of each race is, for women and for men. Women's index is mapped onto the men's scale so the two can be compared.",
    method_link: "How it's computed",
    credit: "Index created by Travis Loncar (Freetrail)",
    latest_title: "Strongest fields",
    latest_sub: "RCI10 at each race's latest edition",
    by_format: "By format",
    risers: "Biggest rises",
    risers_sub: "Latest edition compared with the previous one",
    see_all: "Full rankings",
    rankings_title: "Rankings",
    rankings_sub: "RCI10 of every race, women and men ranked separately.",
    season: "Season",
    latest_edition: "Latest edition",
    all_formats: "All",
    compare_title: "Compare",
    compare_sub: "Up to 4 races, each at its latest edition.",
    compare_search: "Add a race…",
    compare_full: "4 races at most",
    compare_remove: (name: string) => `Remove ${name}`,
    compare_suggest: "Suggestions",
    compare_pick: "Add at least one race to compare.",
    verdict: (g: string, name: string, v: string, gap: string | null) => `${g}: ${name} has the strongest field (RCI10 ${v}${gap ? `, ${gap} ahead of the next` : ""}).`,
    face_off: "Head to head",
    face_off_sub: "RCI10 at the latest edition",
    details: "In detail",
    details_sub: "Latest edition of each race",
    n_index: "Finishers with an index",
    mean10: "Top 10 mean",
    median10: "Top 10 median",
    no_data: "–",
    method_title: "Method",
    method_sub: "How RCI is computed, where the data comes from, and what it does not tell you.",
    nav_records: "Records",
    records_title: "Records",
    records_sub: "The strongest fields since 2005, by RCI10.",
    records_alltime: "Strongest fields of all time",
    records_alltime_sub: "Across every edition",
    records_broken: (season: number) => `Records broken in ${season}`,
    records_broken_sub: (min: number) => `Latest edition above all earlier ones (at least ${min} editions), with the margin over the old record`,
    records_prev: (v: string, year: number) => `old record: ${v} (${year})`,
    records_rises: "Biggest jumps",
    records_rises_sub: "From one edition to the next. Scores come from times, so a jump can also reflect the weather or a course change.",
    records_each: "Every race's record",
    records_each_sub: "Best edition of each race. On the right, how far the latest edition is from that record.",
    nav_me: "Where I stand",
    me_title: "Where do you stand?",
    me_sub: "Enter your index: here is the place it would have earned you at the latest edition of each race.",
    me_cta: "And you, where would you have finished?",
    me_index: "Your index",
    me_scale: "Scale",
    me_gender: "Ranking",
    me_both: "Both",
    me_where: "Your index is on your itra.run or utmb.world profile. Each scale applies to the races that have its results.",
    me_summary: (n: number, podiums: number, top10: number, half: number) =>
      `Across ${n} race${n > 1 ? "s" : ""}: ${podiums} podium${podiums > 1 ? "s" : ""}, ${top10} top 10${top10 > 1 ? "s" : ""}, ${half} in the top half.`,
    me_of: "of",
    me_top: (pct: number) => `top ${pct}%`,
    me_gap: (pts: number) => `${pts} pt${pts > 1 ? "s" : ""} off the top 10`,
    me_missing: (n: number, scale: string) => `${n} race${n > 1 ? "s" : ""} without complete ${scale} results ${n > 1 ? "are" : "is"} not listed.`,
    me_note: "A race score comes from your time, as the index does: these places assume a performance equal to your index on the day. Only finishers count.",
  },
};

export function t(lang: Lang) {
  return STRINGS[lang];
}

export const SERIES: Record<string, string> = {
  gtws: "Golden Trail World Series",
  "utmb-world-series": "UTMB World Series",
  "wmra-world-cup": "WMRA World Cup",
  "canadian-trail-championships": "Championnats canadiens",
};

// The article that introduced RCI.
export const FREETRAIL_RCI = "https://fantasy.freetrail.com/news/2026/01/realized-competition-index";

// Where the women's index conversion comes from (Enduraw's formulas, published by Distances+).
export const ENDURAW_NORM = "https://distances.plus/communaute/trail-running-classement-teams-trail-composition-2025/";

export const SOURCES: Record<string, string> = { itra: "ITRA", utmb: "UTMB Index", legacy: "ITRA (archive)" };

export function racePath(lang: Lang, id: string) {
  return lang === "fr" ? `/fr/course/${id}/` : `/en/race/${id}/`;
}

export function rankingsPath(lang: Lang) {
  return lang === "fr" ? "/fr/classement/" : "/en/rankings/";
}

export function comparePath(lang: Lang, ids: string[] = []) {
  const base = lang === "fr" ? "/fr/comparer/" : "/en/compare/";
  return ids.length ? `${base}?c=${ids.join(",")}` : base;
}

export function methodPath(lang: Lang) {
  return lang === "fr" ? "/fr/methode/" : "/en/method/";
}

export function recordsPath(lang: Lang) {
  return `/${lang}/records/`;
}

export function mePath(lang: Lang) {
  return lang === "fr" ? "/fr/et-moi/" : "/en/where-i-stand/";
}

export function countryName(lang: Lang, iso2: string | null) {
  if (!iso2) return "";
  try { return new Intl.DisplayNames([lang], { type: "region" }).of(iso2) ?? iso2; } catch { return iso2; }
}

export function flag(iso2: string | null) {
  if (!iso2 || iso2.length !== 2) return "";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0)));
}

export function fmtNum(lang: Lang, v: number | null | undefined, digits = 0) {
  if (v == null) return "–";
  return v.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDelta(lang: Lang, d: number) {
  return (d > 0 ? "+" : d < 0 ? "−" : "±") + fmtNum(lang, Math.abs(d), 1);
}

export function fmtTime(s: number | null) {
  if (s == null) return "–";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ordinal(lang: Lang, n: number) {
  if (lang === "fr") return n === 1 ? "1re" : `${n}e`;
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "MOIRAULT Jean-Pierre" (ITRA) or "Jean-Pierre MOIRAULT" (UTMB) → "Jean-Pierre Moirault".
// Family names are the all-capital words; a name entirely in capitals is just title-cased.
export function displayName(raw: string) {
  const cap = (w: string) => w.toLowerCase().replace(/(^|[-'\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  const parts = raw.trim().split(/\s+/);
  const isFamily = (p: string) => p === p.toUpperCase() && /\p{L}{2}/u.test(p);
  const family = parts.filter(isFamily), given = parts.filter(p => !isFamily(p));
  if (!family.length || !given.length) return parts.map(cap).join(" ");
  return `${given.join(" ")} ${family.map(cap).join(" ")}`;
}
