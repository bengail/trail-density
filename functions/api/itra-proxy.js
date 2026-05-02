// Cloudflare Pages Function — server-side proxy for itra.run results pages.
// Bypasses CORS. Whitelists itra.run/Races/RaceResults/ only.
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, sessionToken } = body;

  if (
    !url ||
    typeof url !== "string" ||
    !url.startsWith("https://itra.run/Races/RaceResults/")
  ) {
    return Response.json(
      { error: "Invalid URL — must start with https://itra.run/Races/RaceResults/" },
      { status: 400 }
    );
  }

  if (!sessionToken || typeof sessionToken !== "string") {
    return Response.json({ error: "sessionToken is required" }, { status: 400 });
  }

  let itraResponse;
  try {
    itraResponse = await fetch(url, {
      headers: {
        Cookie: `SessionToken=${sessionToken}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
  } catch (err) {
    return Response.json(
      { error: "Network error reaching itra.run: " + (err?.message || String(err)) },
      { status: 502 }
    );
  }

  if (!itraResponse.ok) {
    return Response.json(
      { error: `itra.run returned HTTP ${itraResponse.status}` },
      { status: 502 }
    );
  }

  const html = await itraResponse.text();
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
