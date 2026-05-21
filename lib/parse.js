export function parseSeriesInput(value) {
  if (!value || !String(value).trim()) return null;
  const parts = String(value).split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : parts;
}

export function parseNullableNumber(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export function asNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function normalizeHeaderKey(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/﻿/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseDelimitedRow(line, delimiter) {
  return line.split(delimiter).map(cell => cell.trim());
}

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const first = lines[0] || "";
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) return "\t";
  if (semiCount > commaCount && semiCount > 0) return ";";
  return ",";
}

export function readField(row, headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return row[idx];
  }
  return "";
}

export function toNumberLoose(value) {
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  return Number(text.replace(",", "."));
}

export function looksLikeHeader(cells) {
  const h = cells.map(normalizeHeaderKey);
  const known = new Set(["rank", "position", "pos", "place", "runner", "name", "athlete",
    "time", "race_score", "score", "index", "itra_score", "utmb_index",
    "gender", "sex", "nationality", "country", "nation", "nat"]);
  return h.some(v => known.has(v));
}

export function findLikelyScoreCell(row) {
  for (let i = row.length - 1; i >= 1; i--) {
    const cell = String(row[i] ?? "").trim();
    if (!cell || cell.includes(":")) continue;
    const n = toNumberLoose(cell);
    if (Number.isFinite(n)) return cell;
  }
  return "";
}

export function parsePastedResults(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("Results input is empty.");
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Results input is empty.");
  const firstRow = parseDelimitedRow(lines[0], delimiter);
  const hasHeader = looksLikeHeader(firstRow);
  const headers = hasHeader ? firstRow.map(normalizeHeaderKey) : [];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map(line => parseDelimitedRow(line, delimiter));
  if (!rows.length) throw new Error("No data rows found.");
  const results = [];
  for (const row of rows) {
    const rankText = readField(row, headers, ["rank", "position", "pos", "place", "overall_rank"]) || row[0] || "";
    const runnerText = readField(row, headers, ["runner", "name", "athlete", "runner_name", "full_name"]) || row[1] || "";
    const indexText = readField(row, headers, ["race_score", "score", "index", "itra_score", "utmb_index"]) || row[3] || findLikelyScoreCell(row);
    const genderText = readField(row, headers, ["gender", "sex"]) || row[5] || "";
    const nationalityText = readField(row, headers, ["nationality", "country", "nation", "nat"]) || row[6] || "";
    const rank = toNumberLoose(rankText);
    const index = toNumberLoose(indexText);
    if (!Number.isFinite(rank) || rank < 1) continue;
    if (!Number.isFinite(index)) continue;
    results.push({
      rank: Math.floor(rank),
      runner: asNullableText(runnerText),
      index,
      gender: asNullableText(genderText),
      nationality: asNullableText(nationalityText)
    });
  }
  if (!results.length) throw new Error("No valid rows found. Need numeric rank and race score/index columns.");
  results.sort((a, b) => a.rank - b.rank);
  return results;
}

export function itraUrlToMeta(url) {
  const m = url.match(/RaceResults\/(.+?)\/(\d{4})\/(\d+)/);
  if (!m) return {};
  const slug = m[1];
  const year = parseInt(m[2], 10);
  const name = slug.replace(/\./g, " ");
  const raceId = slug.toUpperCase().replace(/\./g, "_") + "_" + year;
  return { name, year, raceId };
}

export function makeBulkRaceId(name, km, year) {
  const parts = [name, km ? `${Math.round(km)}KM` : null, year].filter(Boolean);
  return parts.join("_").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') { inQuotes = !inQuotes; }
    else if ((c === "," || c === ";") && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += c; }
  }
  result.push(current.trim());
  return result;
}

export function parseBulkCsv(text) {
  const rows = [];
  for (const line of text.split("\n").map(l => l.trim()).filter(Boolean)) {
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;
    const url = cols[cols.length - 1];
    if (!url.startsWith("http")) continue;
    const name = cols[1] || null;
    const km = parseFloat(cols[2]) || null;
    const urlMeta = itraUrlToMeta(url);
    const year = urlMeta.year || null;
    const computedName = name ? (km ? `${name} ${km}km` : name) : (urlMeta.name || "");
    const computedRaceId = makeBulkRaceId(name || urlMeta.name || "", km, year);
    rows.push({
      country: cols[0] || null,
      name,
      km,
      elevation: parseFloat(cols[3]) || null,
      url,
      computedName,
      computedRaceId,
      status: "pending",
      error: null,
      resultCount: null
    });
  }
  return rows;
}
