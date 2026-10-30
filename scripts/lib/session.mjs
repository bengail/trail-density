// Shared browser session for import scripts.
// Uses the system Chrome with a dedicated persistent profile in .auth/ (gitignored),
// so ITRA / UTMB logins survive between runs. ITRA rejects headless Chrome (403), so default to a visible window.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PROFILE_DIR = path.join(ROOT, ".auth/chrome-profile");
// ITRA's auth cookie is a session cookie: Chrome drops it when the window closes, even with
// "remember me". We snapshot cookies while the browser is open and re-inject the session ones.
const COOKIE_FILE = path.join(ROOT, ".auth/session-cookies.json");

export async function openSession({ headless = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  try {
    const saved = JSON.parse(await fs.readFile(COOKIE_FILE, "utf8"));
    const present = new Set((await context.cookies()).map(c => `${c.domain}|${c.name}`));
    const missing = saved.filter(c => c.expires === -1 && !present.has(`${c.domain}|${c.name}`));
    if (missing.length) await context.addCookies(missing);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return context;
}

// Saves the session cookies of ITRA / UTMB so the next openSession() can restore them.
export async function saveSessionCookies(context) {
  const cookies = (await context.cookies()).filter(c => c.expires === -1 && /itra\.run|utmb\.world/.test(c.domain));
  await fs.writeFile(COOKIE_FILE, JSON.stringify(cookies, null, 1), { mode: 0o600 });
  return cookies.length;
}

// Navigates to an ITRA results page and returns its HTML once the results table
// (or a definitive non-results page) is rendered. Throws "ITRA_LOGIN_REQUIRED" when logged out:
// logged-out pages still render the table, but the Race Score column is replaced by a subscribe paywall.
// With credentials in .env, an expired session is renewed once automatically.
export async function fetchItraResultsHtml(context, url) {
  try {
    return await fetchItraResultsHtmlOnce(context, url);
  } catch (e) {
    if (e.message !== "ITRA_LOGIN_REQUIRED") return fetchItraResultsHtmlOnce(context, url);  // big pages occasionally time out — retry once
    if (!(await loginItra(context))) throw e;
    return fetchItraResultsHtmlOnce(context, url);
  }
}

async function fetchItraResultsHtmlOnce(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // The WAF challenge reloads the page once solved — wait for real content.
    await page.waitForFunction(
      () => document.getElementById("RunnerRaceResults") ||
            document.querySelector('input[type="password"]') ||
            document.querySelector("footer"),
      null, { timeout: 60000 }
    );
    const html = await page.content();
    if (html.includes("Subscribe to an ITRA Subscription") ||
        (!html.includes('id="RunnerRaceResults"') && /type="password"|Account\/Login/i.test(html))) {
      throw new Error("ITRA_LOGIN_REQUIRED");
    }
    return html;
  } finally {
    await page.close();
  }
}

// Returns the UTMB access_token (JWT). The cookie only lives ~30 min, but the Keycloak session
// (accounts.utmb.world, remember-me) re-issues it when utmb.world is loaded. Null when logged out.
export async function getUtmbToken(context) {
  const token = await readUtmbTokenCookie(context);
  if (token) return token;
  const page = await context.newPage();
  try {
    await page.goto("https://utmb.world/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  } finally {
    await page.close();
  }
  return (await readUtmbTokenCookie(context)) ?? ((await loginUtmb(context)) ? readUtmbTokenCookie(context) : null);
}

async function readUtmbTokenCookie(context) {
  const cookies = await context.cookies(["https://utmb.world", "https://api.utmb.world"]);
  const c = cookies.find(c => c.name === "access_token");
  if (!c) return null;
  if (c.expires > 0 && c.expires * 1000 < Date.now()) return null;
  return c.value;
}

// ── Automatic login (credentials from .env, see .env.example) ────────────────
// Fills the sites' own login forms. Gives up (returns false) when credentials are missing or the
// form does not lead to a logged-in page, e.g. a captcha — then `pnpm run login` is needed.

function credentials(site) {
  try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* optional */ }
  const email = process.env[`${site}_EMAIL`], password = process.env[`${site}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export async function loginItra(context) {
  const creds = credentials("ITRA");
  if (!creds) return false;
  const page = await context.newPage();
  try {
    await page.goto("https://itra.run/Account/Login", { waitUntil: "domcontentloaded", timeout: 60000 });
    // The page has two form#account (one hidden per layout) — use the visible one.
    const form = page.locator("form#account").filter({ visible: true }).first();
    await form.locator('input[name="Input.Email"]').fill(creds.email);
    await form.locator('input[name="Input.Password"]').fill(creds.password);
    await form.locator('input[name="Input.RememberMe"]').check({ timeout: 2000 }).catch(() => {});
    await Promise.all([
      page.waitForURL(u => !/\/Account\/Login/i.test(u.pathname), { timeout: 60000 }),
      form.locator('button[type="submit"]').click(),
    ]);
    const ok = (await context.cookies("https://itra.run")).some(c => c.name === ".AspNetCore.Identity.Application");
    if (ok) await saveSessionCookies(context);
    console.log(ok ? "  ↻ session ITRA renouvelée automatiquement" : "  ✗ login ITRA automatique échoué");
    return ok;
  } catch {
    console.log("  ✗ login ITRA automatique échoué");
    return false;
  } finally {
    await page.close();
  }
}

// UTMB uses Keycloak (accounts.utmb.world); its remember-me session normally lasts long enough
// that this only runs every few days.
export async function loginUtmb(context) {
  const creds = credentials("UTMB");
  if (!creds) return false;
  const page = await context.newPage();
  try {
    await page.goto("https://utmb.world/my-utmb/my-dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForURL(/accounts\.utmb\.world/, { timeout: 30000 });
    await page.locator('input[name="username"]').fill(creds.email);
    await page.locator('input[name="password"]').fill(creds.password);
    await page.locator('input[name="rememberMe"]').check().catch(() => {});
    await Promise.all([
      page.waitForURL(/^https:\/\/utmb\.world\//, { timeout: 60000 }),
      page.locator('#kc-login, button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const ok = !!(await readUtmbTokenCookie(context));
    console.log(ok ? "  ↻ session UTMB renouvelée automatiquement" : "  ✗ login UTMB automatique échoué");
    return ok;
  } catch {
    console.log("  ✗ login UTMB automatique échoué");
    return false;
  } finally {
    await page.close();
  }
}
