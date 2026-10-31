// Link-preview images (og:image, 1200×630 PNG), rendered at build time from an SVG with resvg.
// Social apps don't read SVG or CSS variables, so colours are plain hex copies of the light-theme tokens.
import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { t, countryName, fmtNum, fmtDelta, type Lang } from "./i18n";
import type { Gender, Race, RaceSummary } from "./types";

const W = 1200, H = 630, PAD = 64;
const C = { bg: "#f8f5f0", text: "#2b231d", text2: "#7a6f66", grid: "#e4ddd3", F: "#2f6bb0", M: "#c4612c" };
const FONT_DIR = path.resolve("src/og/fonts");
const FONTS = fs.readdirSync(FONT_DIR).map(f => path.join(FONT_DIR, f));

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// Greedy wrap on an average glyph width; good enough for 1–2 line titles.
function wrap(text: string, size: number, width: number, maxLines: number) {
  const perLine = Math.floor(width / (size * 0.56));
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last != null && (last + " " + word).length <= perLine) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines.length <= maxLines ? lines : null;
}

function title(text: string, y: number, width: number) {
  for (const size of [76, 64, 54, 46]) {
    const lines = wrap(text, size, width, 2);
    if (lines) {
      const svg = lines.map((l, i) => `<text x="${PAD}" y="${y + i * size * 1.05}" font-family="Archivo" font-weight="800" font-size="${size}" letter-spacing="-1.5" fill="${C.text}">${esc(l)}</text>`).join("");
      return { svg, bottom: y + (lines.length - 1) * size * 1.05 };
    }
  }
  return { svg: `<text x="${PAD}" y="${y}" font-family="Archivo" font-weight="800" font-size="46" fill="${C.text}">${esc(text.slice(0, 40))}…</text>`, bottom: y };
}

function frame(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.bg}"/>
    <rect x="0" y="${H - 10}" width="${W / 2}" height="10" fill="${C.F}"/><rect x="${W / 2}" y="${H - 10}" width="${W / 2}" height="10" fill="${C.M}"/>
    <text x="${PAD}" y="${PAD + 24}" font-family="IBM Plex Mono SemiBold" font-size="22" letter-spacing="2" fill="${C.text2}">TRAIL DENSITY · RCI</text>
    ${body}</svg>`;
}

function render(svg: string) {
  return new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Archivo" } }).render().asPng();
}

// RCI10 per edition, women and men, no axes: just the shape and the last values.
function miniHistory(race: Race, x0: number, y0: number, w: number, h: number) {
  const pts = { F: [] as [number, number][], M: [] as [number, number][] };
  for (const e of [...race.editions].reverse()) for (const g of ["F", "M"] as const) if (e[g]?.rci10 != null) pts[g].push([e.year, e[g]!.rci10!]);
  const all = [...pts.F, ...pts.M];
  if (all.length < 3) return "";
  const ys = all.map(p => p[1]), xs = all.map(p => p[0]);
  const lo = Math.min(...ys) - 10, hi = Math.max(...ys) + 10, a = Math.min(...xs), b = Math.max(...xs);
  const x = (v: number) => x0 + (b === a ? w / 2 : ((v - a) / (b - a)) * w);
  const y = (v: number) => y0 + (1 - (v - lo) / (hi - lo)) * h;
  let svg = [0, 0.5, 1].map(k => `<line x1="${x0}" x2="${x0 + w}" y1="${y0 + k * h}" y2="${y0 + k * h}" stroke="${C.grid}" stroke-width="2"/>`).join("");
  svg += `<text x="${x0}" y="${y0 + h + 34}" font-family="IBM Plex Mono Medium" font-size="20" fill="${C.text2}">${a}</text>`;
  svg += `<text x="${x0 + w}" y="${y0 + h + 34}" text-anchor="end" font-family="IBM Plex Mono Medium" font-size="20" fill="${C.text2}">${b}</text>`;
  for (const g of ["F", "M"] as const) {
    const p = pts[g];
    if (!p.length) continue;
    svg += `<polyline points="${p.map(([u, v]) => `${x(u).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${C[g]}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const [lu, lv] = p[p.length - 1];
    svg += `<circle cx="${x(lu)}" cy="${y(lv)}" r="8" fill="${C.bg}" stroke="${C[g]}" stroke-width="5"/>`;
  }
  return svg;
}

export function raceImage(lang: Lang, race: Race) {
  const s = t(lang);
  const km = race.distance_km ?? race.editions[0]?.distance_km;
  const meta = [countryName(lang, race.country), race.format ? s.format_label[race.format] : null, km ? `${fmtNum(lang, km)} km` : null].filter(Boolean).join("  ·  ");
  const tt = title(race.name, 190, W - 2 * PAD);
  let body = tt.svg + `<text x="${PAD}" y="${tt.bottom + 56}" font-family="Archivo" font-weight="600" font-size="28" fill="${C.text2}">${esc(meta)}</text>`;
  const top = 420;
  (["F", "M"] as Gender[]).forEach((g, i) => {
    const eds = race.editions.filter(e => e[g]?.rci10 != null);
    const x = PAD + i * 290;
    const label = `${(g === "F" ? s.women : s.men).toUpperCase()}${eds[0] ? ` · ${eds[0].year}` : ""}`;
    body += `<text x="${x}" y="${top}" font-family="IBM Plex Mono SemiBold" font-size="22" letter-spacing="1" fill="${C[g]}">${esc(label)}</text>`;
    body += `<text x="${x}" y="${top + 82}" font-family="IBM Plex Mono SemiBold" font-size="80" letter-spacing="-2" fill="${C[g]}">${eds[0] ? fmtNum(lang, eds[0][g]!.rci10!, 0) : "–"}</text>`;
    if (eds[1] && eds[0].year - eds[1].year <= 2) {
      body += `<text x="${x}" y="${top + 124}" font-family="IBM Plex Mono Medium" font-size="22" fill="${C.text2}">${esc(s.vs_last(fmtDelta(lang, eds[0][g]!.rci10! - eds[1][g]!.rci10!), eds[1].year))}</text>`;
    }
  });
  body += `<text x="${PAD + 580}" y="${top}" font-family="IBM Plex Mono SemiBold" font-size="22" letter-spacing="1" fill="${C.text2}">RCI10</text>`;
  body += miniHistory(race, PAD + 580, top + 22, W - 2 * PAD - 580, 112);
  return render(frame(body));
}

export function siteImage(lang: Lang, races: RaceSummary[]) {
  const s = t(lang);
  const tt = title(s.home_title, 200, W - 2 * PAD);
  let body = tt.svg;
  // The current number one of each gender, as a teaser.
  (["F", "M"] as Gender[]).forEach((g, i) => {
    const best = races
      .map(r => ({ r, e: r.editions.find(e => e[g]?.rci10 != null) }))
      .filter(x => x.e)
      .sort((a, b) => b.e![g]!.rci10! - a.e![g]!.rci10!)[0];
    if (!best) return;
    const x = PAD + i * 540, y = 440;
    body += `<text x="${x}" y="${y}" font-family="IBM Plex Mono SemiBold" font-size="22" letter-spacing="1" fill="${C[g]}">${esc(`${(g === "F" ? s.women : s.men).toUpperCase()} · N°1`)}</text>`;
    body += `<text x="${x}" y="${y + 56}" font-family="Archivo" font-weight="800" font-size="44" fill="${C.text}">${esc(best.r.name)}</text>`;
    body += `<text x="${x}" y="${y + 100}" font-family="IBM Plex Mono SemiBold" font-size="30" fill="${C[g]}">RCI10 ${fmtNum(lang, best.e![g]!.rci10!, 1)} · ${best.e!.year}</text>`;
  });
  return render(frame(body));
}
