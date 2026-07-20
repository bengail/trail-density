// Cloudflare Pages Function — server-side proxy for itra.run race discovery.
// No auth needed: search page is public. Handles CSRF internally (GET→POST session).
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { countries, dateStart, dateEnd, searchTerms } = body;

  const countryList = Array.isArray(countries) ? countries : [];
  if ((!countryList.length && !searchTerms) || !dateStart || !dateEnd) {
    return Response.json(
      { error: "Provide a race name or at least one country code, plus dateStart and dateEnd (DD-MM-YYYY)" },
      { status: 400 }
    );
  }

  const SEARCH_URL = "https://itra.run/Races/FindRaceResults";
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  // Step 1: GET to obtain CSRF token + anti-forgery cookie
  let getResp;
  try {
    getResp = await fetch(SEARCH_URL, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
  } catch (err) {
    return Response.json({ error: "GET itra.run failed: " + (err?.message || String(err)) }, { status: 502 });
  }

  const getHtml = await getResp.text();

  const tokenMatch = getHtml.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/);
  if (!tokenMatch) {
    return Response.json({ error: "CSRF token not found on itra.run — site may have changed" }, { status: 502 });
  }
  const csrfToken = tokenMatch[1];

  // Extract anti-forgery cookie(s) from Set-Cookie headers
  const setCookies = typeof getResp.headers.getAll === "function"
    ? getResp.headers.getAll("set-cookie")
    : [getResp.headers.get("set-cookie")].filter(Boolean);
  const cookieString = setCookies.map(h => h.split(";")[0].trim()).filter(Boolean).join("; ");

  // Step 2: POST search form
  const params = new URLSearchParams();
  params.append("__RequestVerificationToken", csrfToken);
  for (const c of countryList) params.append("Input.Country", c.toUpperCase());
  params.append("Input.DateStart", dateStart);
  params.append("Input.DateEnd", dateEnd);
  params.append("Input.Longitude", "0");
  params.append("Input.Latitude", "0");
  params.append("ZoomLevel", "2");
  params.append("Input.DateValue", "");
  params.append("Input.MinDistance", "");
  params.append("Input.MaxDistance", "");
  params.append("Input.MinElevationGain", "");
  params.append("Input.MaxElevationGain", "");
  params.append("Input.MinElevationLoss", "");
  params.append("Input.MaxElevationLoss", "");
  params.append("Input.MinItraPts", "");
  params.append("Input.MaxItraPts", "");
  params.append("Input.NationalLeagues", "false");
  params.append("Input.NationalLeague", "false");
  params.append("Input.SearchTerms", searchTerms || "");

  let postResp;
  try {
    postResp = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieString,
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: SEARCH_URL,
        Origin: "https://itra.run",
      },
      body: params.toString(),
      redirect: "follow",
    });
  } catch (err) {
    return Response.json({ error: "POST to itra.run failed: " + (err?.message || String(err)) }, { status: 502 });
  }

  if (!postResp.ok) {
    return Response.json({ error: `itra.run returned HTTP ${postResp.status}` }, { status: 502 });
  }

  const postHtml = await postResp.text();
  const races = parseRaceCards(postHtml);

  return Response.json({ races, total: races.length });
}

function parseRaceCards(html) {
  // All race data is embedded client-side in raceSearchJsonSidePopupNew.
  // We work in document order: track the current event name and country,
  // and emit one entry per distance box that has published results (green.svg).
  const varIdx = html.indexOf("var raceSearchJsonSidePopupNew = [");
  if (varIdx === -1) return [];

  const content = html.slice(varIdx);
  const tokens = [];

  // Race event name — <h4>Name</h4 > (note: ITRA sometimes has a space before >)
  const h4Re = /<h4>([^<]+)<\/h4/g;
  let m;
  while ((m = h4Re.exec(content)) !== null) {
    tokens.push({ type: "name", pos: m.index, value: m[1].trim() });
  }

  // Country — inferred from CountryFlags image src: /images/CountryFlags/fr.svg → FR
  const flagRe = /\/images\/CountryFlags\/([a-z]{2})\.svg/g;
  while ((m = flagRe.exec(content)) !== null) {
    tokens.push({ type: "country", pos: m.index, value: m[1].toUpperCase() });
  }

  // Distance boxes — each <div class='boxes'> contains a RaceDetails link, km, elevation,
  // and optionally green.svg when results are published.
  const boxMarker = "class='boxes'>";
  let searchFrom = 0;
  while (true) {
    const boxIdx = content.indexOf(boxMarker, searchFrom);
    if (boxIdx === -1) break;

    const chunk = content.slice(boxIdx, boxIdx + 1000);
    const hrefMatch = chunk.match(/href='(\/Races\/RaceDetails\/[^']+)'/);
    const kmMatch = chunk.match(/class='count'>([^<]+)</);
    const elevMatch = chunk.match(/class='distance'>([^<]+)</);
    const hasResults = chunk.includes("green.svg");

    if (hrefMatch && kmMatch && elevMatch) {
      tokens.push({
        type: "box",
        pos: boxIdx,
        url: "https://itra.run" + hrefMatch[1].replace("/RaceDetails/", "/RaceResults/"),
        km: parseKm(kmMatch[1]),
        elevation: parseElev(elevMatch[1]),
        hasResults,
      });
    }

    searchFrom = boxIdx + boxMarker.length;
  }

  tokens.sort((a, b) => a.pos - b.pos);

  // Group boxes under events: one entry per h4 event name, accumulating sub-race boxes
  const events = [];
  let curName = "", curCountry = "";
  let curBoxes = [];

  const finalizeEvent = () => {
    if (curBoxes.length > 0) {
      events.push({ name: curName, country: curCountry, boxes: [...curBoxes] });
      curBoxes = [];
    }
  };

  for (const t of tokens) {
    if (t.type === "name") { finalizeEvent(); curName = t.value; }
    else if (t.type === "country") curCountry = t.value;
    else if (t.type === "box" && t.hasResults) curBoxes.push(t);
  }
  finalizeEvent();

  return events.map(ev => {
    const kms = ev.boxes.map(b => b.km).filter(k => k != null);
    return {
      name: ev.name,
      country: ev.country,
      url: ev.boxes[0].url,
      km: kms.length ? Math.max(...kms) : null,
      elevation: ev.boxes.length === 1 ? ev.boxes[0].elevation : null,
      isFestival: ev.boxes.length > 1,
      distances: ev.boxes.map(b => ({ km: b.km, elevation: b.elevation, url: b.url })),
    };
  });
}

function parseKm(str) {
  const m = str.trim().match(/^([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parseElev(str) {
  // "+426 m" or "+1 800 m" — strip everything except digits
  const digits = str.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}
