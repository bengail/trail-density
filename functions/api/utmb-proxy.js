// Cloudflare Pages Function — proxy for api.utmb.world (search + results).
// Search endpoint needs no auth. Results endpoint needs a short-lived Bearer token.
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path, params = {}, token } = body;

  // Whitelist allowed API paths
  const allowed =
    typeof path === "string" &&
    (path === "search/races-qualifiers" || path.startsWith("races/"));

  if (!allowed) {
    return Response.json(
      { error: "Invalid path — must be search/races-qualifiers or races/{uri}/results" },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams(params).toString();
  const url = `https://api.utmb.world/${path}${qs ? "?" + qs : ""}`;

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    origin: "https://utmb.world",
    referer: "https://utmb.world/",
    "x-tenant-id": "worldseries",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  };

  if (token && typeof token === "string") {
    headers["authorization"] = `Bearer ${token}`;
  }

  let resp;
  try {
    resp = await fetch(url, { headers });
  } catch (err) {
    return Response.json(
      { error: "Network error reaching api.utmb.world: " + (err?.message || String(err)) },
      { status: 502 }
    );
  }

  if (!resp.ok) {
    return Response.json(
      { error: `api.utmb.world returned HTTP ${resp.status}` },
      { status: 502 }
    );
  }

  const data = await resp.json();
  return Response.json(data);
}
