// The per-edition part of a race page, as an HTML string: rendered at build time for the latest edition
// and re-rendered in the browser when another year is picked.
import { densityChart, fieldChart } from "./charts";
import { t, fmtNum, fmtTime, flag, displayName, SOURCES, type Lang } from "./i18n";
import type { Edition, GenderBlock, Gender, Source } from "./types";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function depthBlock(lang: Lang, g: Gender, b: GenderBlock | undefined) {
  const s = t(lang);
  const label = g === "F" ? s.women : s.men;
  if (!b) return "";
  const rows = Object.entries(b.depth).sort((a, z) => +z[0] - +a[0])
    .map(([th, n]) => `<div><dt>${s.above(th)}</dt><dd class="num">${fmtNum(lang, n)}</dd></div>`).join("");
  return `
    <div class="depth ${g.toLowerCase()}">
      <h4>${label}</h4>
      <dl>
        <div><dt>${s.finishers}</dt><dd class="num">${fmtNum(lang, b.n)}</dd></div>
        ${rows}
        <div><dt>${s.gap}</dt><dd class="num">${b.gap_1_10 == null ? "–" : `${fmtNum(lang, b.gap_1_10)} ${s.points}`}</dd></div>
      </dl>
    </div>`;
}

function topTable(lang: Lang, g: Gender, b: GenderBlock | undefined) {
  const s = t(lang);
  if (!b?.top10.length) return "";
  const rows = b.top10.map(r => `
    <tr>
      <td class="num">${r.rank}</td>
      <td class="who"><span class="flag" title="${r.nat ?? ""}">${flag(r.nat)}</span>${esc(displayName(r.name))}</td>
      <td class="num">${fmtTime(r.time_s)}</td>
      <td class="num idx">${r.index}</td>
    </tr>`).join("");
  return `
    <div class="top ${g.toLowerCase()}">
      <h4>${g === "F" ? s.women : s.men}</h4>
      <table>
        <thead><tr><th>${s.rank}</th><th>${s.runner}</th><th>${s.time}</th><th>${s.index}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function editionView(lang: Lang, e: Edition, source: Source = e.source) {
  const s = t(lang);
  const labels = { M: s.men, F: s.women };
  const block = e.sources[source];
  if (!block) return `<p class="card muted">${s.no_source(SOURCES[source] ?? source)}</p>`;
  const blocks = { M: block.M, F: block.F };
  return `
    <div class="ed-grid">
      <section class="card">
        <h3>${s.density}</h3>
        <p class="sub muted">${s.density_sub}</p>
        <div class="legend"><span class="f">${s.women}</span><span class="m">${s.men}</span></div>
        ${densityChart(blocks, labels)}
      </section>
      <section class="card">
        <h3>${s.field}</h3>
        <p class="sub muted">${s.field_sub}</p>
        <div class="legend mirror"><span class="m">${s.men}</span><span class="f">${s.women}</span></div>
        ${fieldChart(blocks)}
      </section>
    </div>
    <section class="card">
      <h3>${s.depth}</h3>
      <div class="depth-grid">${depthBlock(lang, "F", block.F)}${depthBlock(lang, "M", block.M)}</div>
    </section>
    <section class="card">
      <h3>${s.top10}</h3>
      <div class="top-grid">${topTable(lang, "F", block.F)}${topTable(lang, "M", block.M)}</div>
      <p class="source muted">${s.source(SOURCES[source] ?? source)} · ${s.raw_note}</p>
    </section>`;
}
