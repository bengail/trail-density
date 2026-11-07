// The sentence under a race's headline numbers: how strong the field is, and whether it really moved.
import type { Lang } from "./i18n";
import type { Gender } from "./types";

// ITRA and UTMB scores are imprecise: a smaller change in RCI10 is not meaningful.
export const STABLE_RCI = 15;

export type Trend = "up" | "flat" | "down";
export const trend = (d: number): Trend => Math.abs(d) < STABLE_RCI ? "flat" : d > 0 ? "up" : "down";

type Level = "world" | "elite" | "strong" | "regional";
const level = (v: number): Level => v >= 900 ? "world" : v >= 850 ? "elite" : v >= 750 ? "strong" : "regional";

interface Kpi { value: number; delta: { d: number; year: number } | null }

const TEXT = {
  fr: {
    level: { world: "de niveau mondial", elite: "d'élite internationale", strong: "fort", regional: "régional" },
    same: (l: string) => `Un plateau ${l}, chez les femmes comme chez les hommes`,
    pair: (f: string, m: string) => `Un plateau ${f} chez les femmes, ${m} chez les hommes`,
    one: (g: Gender, l: string) => `Un plateau ${l} chez les ${g === "F" ? "femmes" : "hommes"}`,
    trend: { up: (y: number) => `plus relevé qu'en ${y}`, down: (y: number) => `moins relevé qu'en ${y}`, flat: (y: number) => `comparable à ${y}` },
    by: (g: Gender, t: string) => `${g === "F" ? "Femmes" : "Hommes"} : ${t}.`,
  },
  en: {
    level: { world: "world-class", elite: "elite international", strong: "strong", regional: "regional" },
    same: (l: string) => `${article(l)} ${l} field for women and men`,
    pair: (f: string, m: string) => `${article(f)} ${f} women's field and ${article(m).toLowerCase()} ${m} men's field`,
    one: (g: Gender, l: string) => `${article(l)} ${l} ${g === "F" ? "women's" : "men's"} field`,
    trend: { up: (y: number) => `stronger than in ${y}`, down: (y: number) => `weaker than in ${y}`, flat: (y: number) => `on a par with ${y}` },
    by: (g: Gender, t: string) => `${g === "F" ? "Women" : "Men"}: ${t}.`,
  },
};

function article(word: string) { return /^[aeiou]/.test(word) ? "An" : "A"; }

export function raceVerdict(lang: Lang, kpis: { F: Kpi | null; M: Kpi | null }) {
  const s = TEXT[lang];
  const genders = (["F", "M"] as const).filter(g => kpis[g]);
  if (!genders.length) return null;

  const levels = genders.map(g => s.level[level(kpis[g]!.value)]);
  const head = genders.length === 1 ? s.one(genders[0], levels[0])
    : levels[0] === levels[1] ? s.same(levels[0]) : s.pair(levels[0], levels[1]);

  const changes = genders.flatMap(g => {
    const delta = kpis[g]!.delta;
    return delta ? [{ g, text: s.trend[trend(delta.d)](delta.year) }] : [];
  });
  if (!changes.length) return `${head}.`;
  if (changes.length === genders.length && new Set(changes.map(c => c.text)).size === 1) return `${head}, ${changes[0].text}.`;
  return `${head}. ${changes.map(c => s.by(c.g, c.text)).join(" ")}`;
}
