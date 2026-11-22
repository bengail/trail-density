// Browser-side race search box (combobox): matching, keyboard navigation and picking.
// Used by the home page (opens the race page) and the compare page (adds the race).
import { t, flag, type Lang } from "./i18n";
import type { RaceSummary } from "./types";

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const fold = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

interface Options {
  lang: Lang;
  input: HTMLInputElement;
  list: HTMLUListElement;
  races: () => RaceSummary[] | null;   // null while index.json is still loading
  exclude?: () => string[];
  onPick: (id: string) => void;
  limit?: number;
}

export function attachRaceSearch({ lang, input, list, races, exclude = () => [], onPick, limit = 8 }: Options) {
  const s = t(lang);

  function show() {
    const q = fold(input.value.trim());
    const all = races() ?? [];
    const skip = exclude();
    // Every word must appear in the race or event name, accents ignored ("ultra chamonix", "megantic").
    const words = q.split(/\s+/).filter(Boolean);
    const found = words.length
      ? all.filter(r => !skip.includes(r.id) && words.every(w => fold(`${r.name} ${r.event.name}`).includes(w))).slice(0, limit)
      : [];
    list.innerHTML = found.map((r, i) =>
      `<li role="option" data-pick="${r.id}"${i === 0 ? ' aria-selected="true"' : ""}>${flag(r.country)} ${esc(r.name)}${r.format ? ` <small class="meta">${s.format_label[r.format]}</small>` : ""}</li>`).join("")
      || (words.length && all.length ? `<li class="none" aria-disabled="true">${s.search_none}</li>` : "");
    list.hidden = !list.innerHTML;
  }

  function pick(id: string) {
    input.value = "";
    list.hidden = true;
    onPick(id);
  }

  input.addEventListener("input", show);
  input.addEventListener("keydown", e => {
    const items = [...list.querySelectorAll<HTMLElement>("li[data-pick]")];
    const cur = items.findIndex(li => li.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const next = (cur + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items.forEach((li, i) => li.setAttribute("aria-selected", String(i === next)));
    } else if (e.key === "Enter" && cur >= 0 && !list.hidden) {
      e.preventDefault();
      pick(items[cur].dataset.pick!);
    } else if (e.key === "Escape") {
      list.hidden = true;
    }
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  // mousedown rather than click: it fires before the input's blur hides the list.
  list.addEventListener("mousedown", e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-pick]");
    if (!li) return;
    e.preventDefault();
    pick(li.dataset.pick!);
  });

  return { refresh: show };
}
