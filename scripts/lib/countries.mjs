// Nationalities are stored as ISO 3166-1 alpha-2 (works with Intl.DisplayNames and flag emoji client-side).
// UTMB already sends alpha-2; ITRA sends IOC codes, mapped here. Unknown / neutral codes → null.

const IOC_TO_ISO2 = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ARG: "AR", ARM: "AM", AUS: "AU", AUT: "AT",
  AZE: "AZ", BAH: "BS", BAN: "BD", BAR: "BB", BEL: "BE", BEN: "BJ", BER: "BM", BHU: "BT", BIH: "BA",
  BLR: "BY", BOL: "BO", BOT: "BW", BRA: "BR", BRN: "BH", BRU: "BN", BUL: "BG", BUR: "BF", CAM: "KH",
  CAN: "CA", CHI: "CL", CHN: "CN", CIV: "CI", CMR: "CM", COD: "CD", COL: "CO", CRC: "CR", CRO: "HR",
  CUB: "CU", CYP: "CY", CZE: "CZ", DEN: "DK", DOM: "DO", ECU: "EC", EGY: "EG", ERI: "ER", ESA: "SV",
  ESP: "ES", EST: "EE", ETH: "ET", FIJ: "FJ", FIN: "FI", FRA: "FR", GAB: "GA", GBR: "GB", GEO: "GE",
  GER: "DE", GHA: "GH", GRE: "GR", GUA: "GT", HAI: "HT", HKG: "HK", HON: "HN", HUN: "HU", INA: "ID",
  IND: "IN", IRI: "IR", IRL: "IE", IRQ: "IQ", ISL: "IS", ISR: "IL", ITA: "IT", JAM: "JM", JOR: "JO",
  JPN: "JP", KAZ: "KZ", KEN: "KE", KGZ: "KG", KOR: "KR", KOS: "XK", KSA: "SA", KUW: "KW", LAO: "LA",
  LAT: "LV", LBN: "LB", LES: "LS", LIE: "LI", LTU: "LT", LUX: "LU", MAC: "MO", MAD: "MG", MAR: "MA",
  MAS: "MY", MDA: "MD", MEX: "MX", MGL: "MN", MKD: "MK", MLT: "MT", MNE: "ME", MON: "MC", MRI: "MU",
  MYA: "MM", NAM: "NA", NCA: "NI", NED: "NL", NEP: "NP", NGR: "NG", NIG: "NE", NOR: "NO", NZL: "NZ",
  OMA: "OM", PAK: "PK", PAN: "PA", PAR: "PY", PER: "PE", PHI: "PH", PNG: "PG", POL: "PL", POR: "PT",
  PRK: "KP", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU", RWA: "RW", SEN: "SN", SGP: "SG",
  SLO: "SI", SMR: "SM", SRB: "RS", SRI: "LK", SUI: "CH", SVK: "SK", SWE: "SE", SYR: "SY", TAN: "TZ",
  TPE: "TW", THA: "TH", TJK: "TJ", TKM: "TM", TUN: "TN", TUR: "TR", UAE: "AE", UGA: "UG", UKR: "UA",
  URU: "UY", USA: "US", UZB: "UZ", VEN: "VE", VIE: "VN", ZAM: "ZM", ZIM: "ZW",
  // ISO alpha-3 spellings that differ from IOC, seen in some ITRA pages / legacy files
  DEU: "DE", NLD: "NL", CHE: "CH", PRT: "PT", DNK: "DK", GRC: "GR", HRV: "HR", SVN: "SI", ZAF: "ZA",
  CHL: "CL", IDN: "ID", MYS: "MY", PHL: "PH", VNM: "VN", URY: "UY", PRY: "PY", SAU: "SA", ARE: "AE",
  NPL: "NP", MNG: "MN", TWN: "TW", LVA: "LV", BGR: "BG", MCO: "MC", DZA: "DZ", CRI: "CR", SLV: "SV",
  GTM: "GT", KWT: "KW", LKA: "LK",
};

export function toIso2(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return IOC_TO_ISO2[c] || null;
}

// Country names as written in the legacy JSON files ("Italia", "Suisse", "USA", …) → alpha-2.
const NAME_TO_ISO2 = {
  usa: "US", "united states": "US", canada: "CA", china: "CN", italia: "IT", italy: "IT", ita: "IT",
  france: "FR", spain: "ES", espagne: "ES", suisse: "CH", switzerland: "CH", japan: "JP", mexico: "MX",
  austria: "AT", poland: "PL", romania: "RO", germany: "DE", norway: "NO", sweden: "SE", "united kingdom": "GB",
  "great britain": "GB", netherlands: "NL", belgium: "BE", portugal: "PT", "czech republic": "CZ", czechia: "CZ",
  slovenia: "SI", slovakia: "SK", andorra: "AD", kenya: "KE", morocco: "MA", "new zealand": "NZ", australia: "AU",
  "south africa": "ZA", finland: "FI", denmark: "DK", ireland: "IE", argentina: "AR", brazil: "BR", chile: "CL",
  colombia: "CO", greece: "GR", vietnam: "VN",
  italie: "IT", "royaume-uni": "GB", irlande: "IE", autriche: "AT", belgique: "BE", "nouvelle-zélande": "NZ",
  "etats-unis": "US", "états-unis": "US", finlande: "FI", roumanie: "RO", "norvège": "NO", "slovénie": "SI",
  australie: "AU", "pays-bas": "NL",
};

export function countryNameToIso2(name) {
  if (!name) return null;
  return NAME_TO_ISO2[String(name).trim().toLowerCase()] || toIso2(name);
}
