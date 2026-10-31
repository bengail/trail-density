// Link-preview images: /og/<lang>/<race id>.png, and /og/<lang>/site.png for the other pages.
import type { APIRoute } from "astro";
import { loadIndex, loadRace } from "../../../lib/data";
import { raceImage, siteImage } from "../../../lib/og";
import { LANGS, type Lang } from "../../../lib/i18n";

export function getStaticPaths() {
  const ids = ["site", ...loadIndex().races.map(r => r.id)];
  return LANGS.flatMap(lang => ids.map(id => ({ params: { lang, id } })));
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Lang;
  const png = params.id === "site" ? siteImage(lang, loadIndex().races) : raceImage(lang, loadRace(params.id!));
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
