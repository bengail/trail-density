// Raw source cache: every page / API payload is fetched once and stored gzipped in data/raw/
// (gitignored), so re-parsing or rebuilding the DB never hits ITRA / UTMB again.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RAW_DIR = path.join(ROOT, "data/raw");

function rawPath(source, key, ext) {
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(RAW_DIR, source, `${safe}.${ext}.gz`);
}

// Returns { body, path, cached }. `fetcher` is only called on a cache miss (or when refresh=true).
export async function cached(source, key, ext, fetcher, { refresh = false } = {}) {
  const file = rawPath(source, key, ext);
  if (!refresh) {
    try {
      const buf = await fs.readFile(file);
      return { body: zlib.gunzipSync(buf).toString("utf8"), path: file, cached: true };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  const body = await fetcher();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, zlib.gzipSync(body));
  return { body, path: file, cached: false };
}

export function relativeToRoot(file) {
  return path.relative(ROOT, file);
}
