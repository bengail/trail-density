import { state } from './state.js';
import { parseSeriesInput, parseNullableNumber, asNullableText, parsePastedResults, itraUrlToMeta, makeRaceSlug } from './lib/parse.js';
import { parseItraHtml } from './lib/parse-itra.js';
import { fmt } from './lib/math.js';

export function setItraStatus(message, type = "") {
  const el = document.getElementById("itraStatus");
  if (!el) return;
  el.style.display = "block";
  el.className = `status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

export function setImportStatus(message, type = "") {
  const el = document.getElementById("importStatus");
  if (!el) return;
  el.className = `status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

export function renderImportPreview(results) {
  const tbody = document.querySelector("#importPreviewTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of results.slice(0, 200)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.rank}</td><td>${r.runner ?? "-"}</td><td>${fmt(r.index, 1)}</td><td>${r.gender ?? "-"}</td><td>${r.nationality ?? "-"}</td>`;
    tbody.appendChild(tr);
  }
}

export function readImportDraftFromForm(resultsOverride = null) {
  const raceId = (document.getElementById("importRaceId")?.value || "").trim();
  const name = (document.getElementById("importName")?.value || "").trim();
  if (!raceId) throw new Error("Race ID is required.");
  if (!name) throw new Error("Race name is required.");
  const results = resultsOverride !== null
    ? resultsOverride
    : parsePastedResults(document.getElementById("importResultsInput")?.value || "");
  const itraIdRaw = document.getElementById("importItraId")?.value;
  const meta = {
    race_id: raceId,
    race_slug: makeRaceSlug(raceId),
    itra_id: itraIdRaw ? (parseInt(itraIdRaw, 10) || null) : (state.importDraft?.meta?.itra_id ?? null),
    name,
    series: parseSeriesInput(document.getElementById("importSeries")?.value),
    country: asNullableText(document.getElementById("importCountry")?.value),
    data_source: asNullableText(document.getElementById("importDataSource")?.value),
    year: parseNullableNumber(document.getElementById("importYear")?.value),
    distance_km: parseNullableNumber(document.getElementById("importDistanceKm")?.value),
    elevation_m: parseNullableNumber(document.getElementById("importElevationM")?.value),
    prize_money: asNullableText(document.getElementById("importPrizeMoney")?.value),
    notes: asNullableText(document.getElementById("importNotes")?.value),
    source_url: asNullableText(document.getElementById("importSourceUrl")?.value)
  };
  return { meta, results };
}

export function buildImportJson() {
  try {
    const rawText = (document.getElementById("importResultsInput")?.value || "").trim();
    const existingResults = (!rawText && state.importDraft?.results?.length)
      ? state.importDraft.results : null;
    const draft = readImportDraftFromForm(existingResults);
    state.importDraft = draft;
    renderImportPreview(draft.results);
    setImportStatus(`${draft.results.length} results ready.`, "ok");
  } catch (err) {
    state.importDraft = null;
    renderImportPreview([]);
    setImportStatus(err.message || "Unable to build JSON.", "error");
  }
}

export async function saveRaceToSupabase(meta, results) {
  if (!window.supabaseClient) throw new Error("Supabase not configured — check config.js.");
  const seriesValue = meta.series ? (Array.isArray(meta.series) ? meta.series : [meta.series]) : [];
  const courseRow = {
    race_id: meta.race_id,
    race_slug: meta.race_slug || makeRaceSlug(meta.race_id),
    itra_id: meta.itra_id ?? null,
    name: meta.name, series: seriesValue, country: meta.country,
    year: meta.year, distance_km: meta.distance_km, elevation_m: meta.elevation_m,
    prize_money: meta.prize_money, data_source: meta.data_source,
    source_url: meta.source_url, notes: meta.notes
  };
  const { data: courseData, error: courseError } = await window.supabaseClient
    .from("courses").upsert(courseRow, { onConflict: "race_id" }).select("id").single();
  if (courseError) throw new Error("Course upsert failed: " + courseError.message);
  const courseId = courseData.id;
  const { error: deleteError } = await window.supabaseClient
    .from("results").delete().eq("course_id", courseId);
  if (deleteError) throw new Error("Delete old results failed: " + deleteError.message);
  const resultRows = results.map(r => ({
    course_id: courseId, rank: r.rank, runner: r.runner,
    index: r.index, gender: r.gender, nationality: r.nationality
  }));
  const { error: insertError } = await window.supabaseClient.from("results").insert(resultRows);
  if (insertError) throw new Error("Insert results failed: " + insertError.message);
  return { courseId, count: results.length };
}

export async function importToSupabase() {
  if (!window.supabaseClient) { setImportStatus("Supabase not configured — check config.js.", "error"); return; }
  if (!state.importDraft) { setImportStatus("Preview the data first before saving.", "error"); return; }
  const { meta, results } = state.importDraft;
  const btn = document.getElementById("importSaveSupabaseBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  setImportStatus("Saving to Supabase…");
  try {
    await saveRaceToSupabase(meta, results);
    setImportStatus(`Saved "${meta.name}" (${results.length} results). Reloading…`, "ok");
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    setImportStatus(err.message || "Save failed.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Save to Supabase"; }
  }
}

export async function fetchFromItra() {
  const url = (document.getElementById("itraUrl")?.value || "").trim();
  const cookieHeader = (document.getElementById("itraToken")?.value || "").trim();
  const btn = document.getElementById("itraFetchBtn");

  if (!url) { setItraStatus("Paste an itra.run results URL first.", "error"); return; }
  if (!cookieHeader) { setItraStatus("Paste your itra.run cookie header (from DevTools Network tab).", "error"); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Fetching…"; }
  setItraStatus("Fetching from itra.run…");

  try {
    const resp = await fetch("/api/itra-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, cookieHeader })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || `Proxy error ${resp.status}`);
    }

    const html = await resp.text();
    const results = parseItraHtml(html, url);

    const urlMeta = itraUrlToMeta(url);
    if (urlMeta.raceId) {
      const raceIdEl = document.getElementById("importRaceId");
      if (raceIdEl && !raceIdEl.value) raceIdEl.value = urlMeta.raceId;
    }
    if (urlMeta.name) {
      const nameEl = document.getElementById("importName");
      if (nameEl && !nameEl.value) nameEl.value = urlMeta.name;
    }
    if (urlMeta.year) {
      const yearEl = document.getElementById("importYear");
      if (yearEl && !yearEl.value) yearEl.value = String(urlMeta.year);
    }
    if (urlMeta.itraId) {
      const itraIdEl = document.getElementById("importItraId");
      if (itraIdEl && !itraIdEl.value) itraIdEl.value = String(urlMeta.itraId);
    }

    const raceId = document.getElementById("importRaceId")?.value || urlMeta.raceId || "";
    state.importDraft = {
      meta: {
        race_id: raceId,
        race_slug: makeRaceSlug(raceId),
        itra_id: urlMeta.itraId || null,
        name: document.getElementById("importName")?.value || urlMeta.name || "",
        series: parseSeriesInput(document.getElementById("importSeries")?.value),
        country: asNullableText(document.getElementById("importCountry")?.value),
        data_source: "ITRA",
        year: parseNullableNumber(document.getElementById("importYear")?.value) || urlMeta.year || null,
        distance_km: parseNullableNumber(document.getElementById("importDistanceKm")?.value),
        elevation_m: parseNullableNumber(document.getElementById("importElevationM")?.value),
        prize_money: asNullableText(document.getElementById("importPrizeMoney")?.value),
        notes: asNullableText(document.getElementById("importNotes")?.value),
        source_url: url
      },
      results
    };

    const srcEl = document.getElementById("importDataSource");
    if (srcEl && !srcEl.value) srcEl.value = "ITRA";
    const srcUrlEl = document.getElementById("importSourceUrl");
    if (srcUrlEl && !srcUrlEl.value) srcUrlEl.value = url;

    renderImportPreview(results);
    setItraStatus(`${results.length} results fetched. Review metadata below, then Save to Supabase.`, "ok");
    setImportStatus(`${results.length} results loaded from ITRA. Fill any missing metadata, then save.`, "ok");
  } catch (err) {
    setItraStatus(err.message || "Fetch failed.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Fetch & Preview"; }
  }
}
