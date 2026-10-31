// One-time (or when sessions expire): opens a visible Chrome on ITRA and UTMB login pages.
// Log in on both tabs, then close the Chrome window — the session is kept in .auth/.
import { openSession, saveSessionCookies, loginItra } from "./lib/session.mjs";

const context = await openSession({ headless: false });
if (await loginItra(context)) console.log("ITRA : connecté avec les identifiants du .env");
const itra = context.pages()[0] || await context.newPage();
await itra.goto("https://itra.run/Account/Login");
const utmb = await context.newPage();
await utmb.goto("https://utmb.world/");

console.log("Connecte-toi sur ITRA et UTMB dans la fenêtre Chrome, puis ferme la fenêtre.");
// Session cookies vanish with the window, so snapshot them while it is open.
let saved = 0;
const timer = setInterval(async () => {
  saved = await saveSessionCookies(context).catch(() => saved);
}, 2000);
await new Promise(resolve => context.on("close", resolve));
clearInterval(timer);
console.log(`Session enregistrée dans .auth/ (${saved} cookies de session)`);
