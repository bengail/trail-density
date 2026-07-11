// Cloudflare Pages Function — parses an ITRA race page to extract editions + sibling distances.
// Auth cookie required: ITRA locks result pages behind login.
export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { url, cookieHeader } = body;
  if (!url || typeof url !== "string" || !url.startsWith("https://itra.run/Races/RaceResults/")) {
    return Response.json(
      { error: "Invalid URL — must start with https://itra.run/Races/RaceResults/" },
      { status: 400 }
    );
  }
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return Response.json({ error: "cookieHeader is required" }, { status: 400 });
  }

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  let resp;
  try {
    resp = await fetch(url, {
      headers: { Cookie: cookieHeader, "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
  } catch (err) {
    return Response.json({ error: "Network error: " + (err?.message || String(err)) }, { status: 502 });
  }

  if (!resp.ok) {
    return Response.json({ error: `itra.run returned HTTP ${resp.status}` }, { status: 502 });
  }

  const html = await resp.text();
  let parsed;
  try {
    parsed = parseRacePageInfo(html, url);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  // Build multi-race × multi-year grid if siblings exist (e.g. CCC / OCC / UTMB® sub-races)
  const activeSiblings = parsed.siblings.filter(s => !s.isCancelled);
  if (activeSiblings.length >= 2) {
    try {
      parsed.grid = await buildEditionGrid(parsed, cookieHeader, UA);
    } catch (err) {
      // Grid building failed — degrade gracefully, client falls back to flat edition list
      parsed.gridError = err.message;
    }
  }

  return Response.json(parsed);
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function slugToRaceId(rawSlug) {
  // URL-decode, replace dots with dashes, lowercase
  let s = rawSlug;
  try { s = decodeURIComponent(rawSlug); } catch { /* already decoded */ }
  return s.replace(/\./g, "-").toLowerCase();
}

function parseRacePageInfo(html, url) {
  // URL pattern: /Races/RaceResults/{slug}/{year}/{itraId}
  const urlMatch = url.match(/\/Races\/RaceResults\/([^/]+)\/(\d{4})\/(\d+)/);
  if (!urlMatch) throw new Error("Cannot parse URL: " + url);
  const [, slug, yearStr, currentItraId] = urlMatch;
  const currentYear = parseInt(yearStr, 10);

  // Event name: <h1 class="itra-green display-6 pb-2">Marathon du Mont-Blanc 2026</h1>
  const eventNameMatch = html.match(/<h1[^>]*class="[^"]*itra-green[^"]*"[^>]*>\s*([^<]+?)\s*<\/h1>/);
  const eventName = eventNameMatch
    ? decodeHtmlEntities(eventNameMatch[1].trim())
    : slug.replace(/\./g, " ");

  // Race name: first <h3> in content (e.g. "42km du Mont-Blanc")
  const raceNameMatch = html.match(/<h3>\s*([^<]+?)\s*<\/h3>/);
  const raceName = raceNameMatch ? decodeHtmlEntities(raceNameMatch[1].trim()) : "";

  // Editions from <select id="select_id" onchange="GetEventPreviousEdition(this)">
  // Option value = numeric ITRA race ID, text = year (e.g. "2026")
  // If the race has only one edition ITRA omits the dropdown entirely — fall back to current URL.
  const editions = [];
  const selectMatch = html.match(/<select[^>]+id="select_id"[^>]*>([\s\S]*?)<\/select>/);
  if (selectMatch) {
    const optRe = /<option value="(\d+)"[^>]*>\s*(\d{4})\s*<\/option>/g;
    let m;
    while ((m = optRe.exec(selectMatch[1])) !== null) {
      const itraId = m[1];
      const year = parseInt(m[2], 10);
      editions.push({
        year,
        itraId,
        url: `https://itra.run/Races/RaceResults/${slug}/${year}/${itraId}`
      });
    }
    editions.sort((a, b) => b.year - a.year);
  }
  if (editions.length === 0) {
    editions.push({
      year: currentYear,
      itraId: currentItraId,
      url: `https://itra.run/Races/RaceResults/${slug}/${currentYear}/${currentItraId}`
    });
  } else {
    // The year dropdown shows the event-level itraId for the current year, which is shared
    // across all sub-races in the same event weekend. The page URL itself has the correct
    // per-race itraId. Override the current year's entry with it.
    const cur = editions.find(e => e.year === currentYear);
    if (cur && cur.itraId !== currentItraId) {
      cur.itraId = currentItraId;
      cur.url = `https://itra.run/Races/RaceResults/${slug}/${currentYear}/${currentItraId}`;
    }
  }

  // Siblings: other distances in same event
  // <a class="btn btn-outline-dark[ itra-green][ text-decoration-line-through-red]"
  //    href="/Races/RaceDetails/{slug}/{year}/{itraId}">{name}</a>
  const siblings = [];
  const seen = new Set();
  const sibRe = /<a\s+class="btn btn-outline-dark([^"]*)"[^>]*href="\/Races\/RaceDetails\/([^"]+?)\/(\d{4})\/(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
  let sm;
  while ((sm = sibRe.exec(html)) !== null) {
    const classes = sm[1];
    const sibSlug = sm[2];
    const sibYear = parseInt(sm[3], 10);
    const sibItraId = sm[4];
    const sibName = decodeHtmlEntities(sm[5].trim());
    const key = `${sibSlug}/${sibItraId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    siblings.push({
      name: sibName,
      slug: sibSlug,
      year: sibYear,
      itraId: sibItraId,
      url: `https://itra.run/Races/RaceResults/${sibSlug}/${sibYear}/${sibItraId}`,
      isCurrent: classes.includes("itra-green"),
      isCancelled: classes.includes("text-decoration-line-through")
    });
  }

  return { eventName, raceName, slug, currentYear, currentItraId, editions, siblings };
}

// For each year in the dropdown (other than the current page year), fetch the year's page
// and extract the sibling nav links. Those hrefs always carry the correct per-race itraId
// for every sub-race for that year, regardless of which combined itraId was used to fetch.
async function buildEditionGrid({ slug, currentYear, currentItraId, editions, siblings }, cookieHeader, UA) {
  const grid = {};

  // Current year: we already have correct itraIds from the page URL + sibling hrefs
  grid[currentYear] = {};
  for (const sib of siblings.filter(s => !s.isCancelled)) {
    const itraId = sib.isCurrent ? currentItraId : sib.itraId;
    const raceId = slugToRaceId(sib.slug);
    grid[currentYear][raceId] = {
      name: sib.name,
      slug: sib.slug,
      itraId,
      url: `https://itra.run/Races/RaceResults/${sib.slug}/${currentYear}/${itraId}`
    };
  }

  // Other years: parallel-fetch each year's page and parse the sibling nav
  const otherEditions = editions.filter(e => e.year !== currentYear);
  const fetched = await Promise.all(otherEditions.map(async (ed) => {
    try {
      const yearUrl = `https://itra.run/Races/RaceResults/${slug}/${ed.year}/${ed.itraId}`;
      const r = await fetch(yearUrl, {
        headers: { Cookie: cookieHeader, "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) return null;
      const h = await r.text();
      return { year: ed.year, html: h };
    } catch {
      return null;
    }
  }));

  for (const res of fetched) {
    if (!res) continue;
    const { year, html: h } = res;

    // Parse sibling nav links for this year — including the isCurrent one
    const yearSibs = [];
    const seen = new Set();
    const re = /<a\s+class="btn btn-outline-dark([^"]*)"[^>]*href="\/Races\/RaceDetails\/([^"]+?)\/(\d{4})\/(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
    let m;
    while ((m = re.exec(h)) !== null) {
      const classes = m[1];
      if (classes.includes("text-decoration-line-through")) continue;
      const sibSlug = m[2];
      const sibYear = parseInt(m[3], 10);
      if (sibYear !== year) continue;
      const sibItraId = m[4];
      const sibName = decodeHtmlEntities(m[5].trim());
      if (seen.has(sibSlug)) continue;
      seen.add(sibSlug);
      yearSibs.push({ slug: sibSlug, name: sibName, itraId: sibItraId });
    }

    if (yearSibs.length === 0) continue;
    grid[year] = {};
    for (const sib of yearSibs) {
      const raceId = slugToRaceId(sib.slug);
      grid[year][raceId] = {
        name: sib.name,
        slug: sib.slug,
        itraId: sib.itraId,
        url: `https://itra.run/Races/RaceResults/${sib.slug}/${year}/${sib.itraId}`
      };
    }
  }

  return grid;
}
