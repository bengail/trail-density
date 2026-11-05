// One-time (or when sessions expire): opens a visible Chrome on ITRA and UTMB login pages.
// Log in on both tabs, then close the Chrome window — the session is kept in .auth/.
//
//   pnpm run login --manual     when ITRA refuses that window as a bot: plain Chrome, nothing filled in or
//                               automated while you log in; the cookies are read once you press Enter.
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { openSession, saveSessionCookies, loginItra, PROFILE_DIR } from "./lib/session.mjs";

if (process.argv.includes("--manual")) {
  await manualLogin();
  process.exit();
}

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

async function manualLogin() {
  const PORT = 9333;
  const chrome = spawn("google-chrome", [
    `--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${PORT}`, "--no-first-run",
    "https://itra.run/Account/Login", "https://utmb.world/",
  ], { stdio: "ignore" });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Connecte-toi sur ITRA et UTMB dans Chrome, puis reviens ici et appuie sur Entrée. ");
  rl.close();

  try {
    // Nothing is attached to Chrome until here, so the login itself runs in an ordinary browser.
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const context = browser.contexts()[0];
    const loggedIn = (await context.cookies("https://itra.run")).some(c => c.name === ".AspNetCore.Identity.Application");
    if (loggedIn) console.log(`Session enregistrée dans .auth/ (${await saveSessionCookies(context)} cookies de session)`);
    else {
      console.log("Pas de session ITRA trouvée : rien n'a été enregistré.");
      process.exitCode = 1;
    }
    await browser.close();
  } finally {
    chrome.kill();
  }
}
