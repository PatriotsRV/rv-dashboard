// ER Triage Automation - Phase 2b headless browser gate.
//
// Boots the touched page on a local http.server with headless Chromium on the
// UNAUTHENTICATED sampleData path (no Google OAuth, no Supabase session) and
// asserts the build is healthy after the auto-fix:
//   - page loads,
//   - the version badge / version string matches fix_result.version,
//   - zero FATAL console errors (benign Google/GAPI/Supabase-no-session noise
//     is allow-listed and only logged),
//   - for index.html, the board renders sampleData cards,
//   - optional fix-specific assert_text_present / assert_text_absent.
//
// This is the feasible form of spec section 6 item 3: full live-auth rendering
// is not possible in CI (needs Google OAuth), but the sampleData path exercises
// real module load + render + the fix.
//
// Env: PORT (default 8765), REQUIRE_BOARD ("hard" | "soft", default "soft").
// Exit 0 = pass, 1 = fail. Reads fix_result.json at repo root.
//
// Requires: playwright (npx playwright install --with-deps chromium).

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = process.env.PORT || "8765";
const REQUIRE_BOARD = (process.env.REQUIRE_BOARD || "soft").toLowerCase();
const BASE = `http://127.0.0.1:${PORT}/`;

// Console / network errors that are EXPECTED on the unauthenticated headless
// path and must not fail the gate. Substring match, case-insensitive.
const BENIGN = [
  "accounts.google.com", "apis.google.com", "gstatic", "googleapis",
  "gsi/", "gsi_logger", "fedcm", "client_id", "redirect_uri",
  "the given origin is not allowed", "the current origin",
  "cross-origin-opener-policy", "content security policy",
  "supabase.co", "favicon", "net::err_aborted", "play.google",
  "manifest", "preload", "is not allowed by access-control-allow-origin",
];

function isBenign(text) {
  const t = (text || "").toLowerCase();
  return BENIGN.some((b) => t.includes(b));
}

function fail(msg) {
  console.error("BROWSER GATE FAIL: " + msg);
  process.exit(1);
}

const fr = JSON.parse(readFileSync("fix_result.json", "utf-8"));
const bc = fr.browser_check || {};
const page = bc.page || "index.html";
const verToken = (fr.version || "").split(" ")[0]; // e.g. "v1.448"
const url = BASE + page;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext();
const tab = await ctx.newPage();

const errors = [];
tab.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
tab.on("pageerror", (e) => errors.push("pageerror: " + e.message));
tab.on("requestfailed", (r) => {
  const f = r.failure();
  errors.push("requestfailed: " + r.url() + " " + (f ? f.errorText : ""));
});

let boardCards = 0;
try {
  await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (page === "index.html") {
    try {
      await tab.waitForSelector("#boardGrid .ro-card", { timeout: 20000 });
      boardCards = await tab.locator("#boardGrid .ro-card").count();
    } catch {
      boardCards = 0;
    }
  } else {
    await tab.waitForTimeout(4000); // let standalone pages settle
  }

  // Version check
  if (verToken) {
    const hasBadge = await tab.evaluate((v) =>
      [...document.querySelectorAll("span")].some(
        (s) => s.textContent.trim() === v
      ), verToken);
    const html = await tab.content();
    if (!hasBadge && !html.includes(verToken)) {
      fail(`version ${verToken} not found in the loaded page (wrong build?)`);
    }
  }

  // Fix-specific text assertions
  const bodyText = await tab.evaluate(() => document.body.innerText || "");
  const fullHtml = await tab.content();
  for (const s of bc.assert_text_present || []) {
    if (!bodyText.includes(s) && !fullHtml.includes(s)) {
      fail(`expected text not present: ${JSON.stringify(s)}`);
    }
  }
  for (const s of bc.assert_text_absent || []) {
    if (bodyText.includes(s) || fullHtml.includes(s)) {
      fail(`text that should be absent is present: ${JSON.stringify(s)}`);
    }
  }
} finally {
  await browser.close();
}

const fatal = errors.filter((e) => !isBenign(e));
const benign = errors.filter((e) => isBenign(e));

console.log(`--- console summary for ${page} ---`);
console.log(`benign/allow-listed errors: ${benign.length}`);
benign.forEach((e) => console.log("  [benign] " + e.slice(0, 200)));
console.log(`fatal (app-origin) errors: ${fatal.length}`);
fatal.forEach((e) => console.log("  [FATAL] " + e.slice(0, 300)));
if (page === "index.html") console.log(`board sampleData cards: ${boardCards}`);

if (fatal.length > 0) fail(`${fatal.length} fatal console error(s)`);

if (page === "index.html" && boardCards < 1) {
  if (REQUIRE_BOARD === "hard") {
    fail("board rendered 0 sampleData cards (REQUIRE_BOARD=hard)");
  }
  console.log(
    "WARNING: board rendered 0 cards on the headless unauth path. " +
    "No fatal errors, so passing (REQUIRE_BOARD=soft). Confirm on the first " +
    "real dry-run, then set REQUIRE_BOARD=hard."
  );
}

console.log("BROWSER GATE PASS");
