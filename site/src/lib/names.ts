// Runner names as published are messy: "MOIRAULT Jean-Pierre" (ITRA), "Jean-Pierre MOIRAULT" (UTMB),
// all capitals, lowercase first names, aliases in brackets. This turns them into "Jean-Pierre Moirault".

// Names no rule can repair: lost accents, typos in the source, or a different name order.
const FIXES: Record<string, string> = {
  "ARSENAULT Val rie": "Valérie Arsenault",
  "DE LA TULLAYE Ade´lie": "Adélie De La Tullaye",
  "DUO ji": "Duo Ji",
  "HAU HA THI": "Hau Thi Ha",
  "JOYCE MUTHONI NJERU": "Joyce Muthoni Njeru",
  "L HIRONDEL BLANDINE": "Blandine L'Hirondel",
  "MACWILLIAMS ANGELICA": "Angelica MacWilliams",
  "ODEA Eden indigo bliss": "Eden Indigo Bliss O'Dea",
  "TREMBLAY Elie anne tremblay": "Elie-Anne Tremblay",
};

// All-capital names have the family name first. These first names take two words.
const COMPOUND_GIVEN = /^(JEAN|PIER|JUAN|CHARLES) \S+$/;

const cap = (word: string) => word.toLowerCase()
  .replace(/(^|[-'’\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/^Mc(\p{L})/u, (_, c) => `Mc${c.toUpperCase()}`);

const isFamily = (word: string) => word === word.toUpperCase() && /\p{L}{2}/u.test(word);

export function displayName(raw: string) {
  if (FIXES[raw]) return FIXES[raw];
  const parts = raw.replace(/\([^)]*\)|\*/g, " ").trim().split(/\s+/);
  const family = parts.filter(isFamily), given = parts.filter(p => !isFamily(p));
  if (!family.length) return parts.map(cap).join(" ");
  if (!given.length) {
    if (parts.length === 1) return cap(parts[0]);
    const n = COMPOUND_GIVEN.test(parts.slice(-2).join(" ")) ? 2 : 1;
    return [...parts.slice(-n), ...parts.slice(0, -n)].map(cap).join(" ");
  }
  const repeats = new Set(family.map(w => w.toLowerCase()));   // "HEBERT David hebert"
  const first = given.filter(w => !repeats.has(w.toLowerCase())).map(w => (w === w.toLowerCase() ? cap(w) : w));
  return `${first.join(" ")} ${family.map(cap).join(" ")}`;
}
