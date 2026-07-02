import { normalizeSeries } from './normalize.js';

export function matchesFilters(meta, filters) {
  const countryOk = !filters.country || (meta?.country || "") === filters.country;
  const seriesFilter = filters.series;
  const normalizedSeries = normalizeSeries(meta?.series);
  const seriesList = Array.isArray(seriesFilter) ? seriesFilter.filter(Boolean) : seriesFilter ? [seriesFilter] : [];
  const seriesOk = !seriesList.length || seriesList.some(s => normalizedSeries.includes(s));
  return countryOk && seriesOk;
}

export function fuzzyMatch(query, text) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  return terms.every(t => lower.includes(t));
}

export function densityColor(value, min, max) {
  if (!Number.isFinite(value)) return "";
  const clampedMin = Number.isFinite(min) ? min : value;
  const clampedMax = Number.isFinite(max) ? max : value;
  if (clampedMax <= clampedMin) return "background:hsl(224,70%,92%); color:#0f172a; font-weight:600;";
  const ratio = Math.max(0, Math.min(1, (value - clampedMin) / (clampedMax - clampedMin)));
  const lightness = 92 - ratio * 47;
  const saturation = 60 + ratio * 20;
  const bg = `hsl(224, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`;
  const textColor = lightness < 68 ? "#ffffff" : "#0f172a";
  const borderAlpha = (0.06 + ratio * 0.12).toFixed(3);
  return `background:${bg}; color:${textColor}; font-weight:600; box-shadow: inset 0 0 0 1px rgba(15,23,42,${borderAlpha});`;
}
