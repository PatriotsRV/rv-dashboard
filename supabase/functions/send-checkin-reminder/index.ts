// ============================================================
// send-checkin-reminder (Roland directive, Session 162, 2026-07-29)
// ============================================================
// v1.0: MORNING TECH CHECK-IN REMINDER (SMS).
// Fired by pg_cron weekdays (see send_checkin_reminder_s162.sql):
//   8:15 AM CT — early cohort (Mauricio, Ignacio — in around 7:30)
//   9:30 AM CT — main cohort (8 techs — shop start ~9:00)
// For each worker in the fired cohort who has NO time_logs clock-in yet
// TODAY (America/Chicago day; cashiered_time_logs mirror unioned per the
// S102 rule), send an individual SMS to staff.phone_number direct via the
// Textly API — same mechanics as send-unreplied-reminder's staff SMS
// (no conversations row, inbox stays clean).
//
// "No clock-in yet today" was Roland's chosen rule (S162): a worker who
// clocked in earlier and is between jobs at reminder time is NOT nagged.
//
// Request body:
//   { "cohort": "815" | "930",   REQUIRED — which roster + message time
//     "dry_run": true,           optional — report who WOULD be texted, send nothing
//     "force": true,             optional — bypass the weekday guard (testing)
//     "time_label": "1:40",      optional — override the "It's X" time in the
//                                message (manual off-schedule runs; cron omits it)
//     "manual_to": ["email"] }   optional — send ONLY to these staff emails,
//                                BYPASSING the clock-in check (Roland-directed
//                                one-off nags; cron omits it)
//
// Config (app_config, optional):
//   checkin_reminder_enabled  "false" = kill switch (default on)
//
// Rosters are HARDCODED below by Roland's S162 decision — editing them
// means a redeploy.
//
// Deploy (cron invoker sends no auth header):
//   supabase functions deploy send-checkin-reminder --no-verify-jwt
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";

// ── Rosters (S162, Roland) ───────────────────────────────────────────
const COHORTS: Record<string, { timeLabel: string; workers: { name: string; email: string }[] }> = {
  "815": {
    timeLabel: "8:15",
    workers: [
      { name: "Mauricio Tellez", email: "mauricio@patriotsrvservices.com" },
      { name: "Ignacio Ochoa", email: "ignacio@patriotsrvservices.com" },
    ],
  },
  "930": {
    timeLabel: "9:30",
    workers: [
      { name: "Cooper Cihak", email: "cooper@patriotsrvservices.com" },
      { name: "Jason Rubin", email: "jason@patriotsrvservices.com" },
      { name: "Riley Scott", email: "solar@patriotsrvservices.com" },
      { name: "Rod Wombles", email: "rod@patriotsrvservices.com" },
      { name: "Rudy Juarez", email: "rudy@patriotsrvservices.com" },
      { name: "Tipton Scott", email: "tipton@patriotsrvservices.com" },
      { name: "Tommy Belew", email: "tommy@patriotsrvservices.com" },
      { name: "Travis Wombles", email: "travis@patriotsrvservices.com" },
      { name: "Zak Wombles", email: "zak@patriotsrvservices.com" },
    ],
  },
};

function reminderBody(timeLabel: string): string {
  return `It's ${timeLabel} and this is a friendly reminder to make sure you check in to your ROs as soon as you begin work. This is a friendly reminder for you and your coworkers. Thank you`;
}

function chicagoDayISO(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function chicagoWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(d);
}

async function textlySend(to: string, body: string): Promise<boolean> {
  const apiToken = Deno.env.get("TEXTLY_API_TOKEN");
  if (!apiToken) { console.log("SMS skipped: TEXTLY_API_TOKEN not set"); return false; }
  const apiBase = (Deno.env.get("TEXTLY_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  const fromE164 = (Deno.env.get("TEXTLY_FROM_E164") || DEFAULT_FROM_E164).trim();
  try {
    const resp = await fetch(`${apiBase}/api/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: fromE164, message: body }),
    });
    if (!resp.ok) console.error(`checkin reminder SMS Textly HTTP ${resp.status} to ${to}`);
    return resp.ok;
  } catch (e) {
    console.error("checkin reminder SMS failed:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: {
    cohort?: string; dry_run?: boolean; force?: boolean;
    time_label?: string; manual_to?: string[];
  } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const cohort = COHORTS[String(body.cohort || "")];
  if (!cohort) return json({ ok: false, error: 'cohort must be "815" or "930"' }, 400);

  // ── Weekday guard (Mon-Fri, America/Chicago) ───────────────────────
  const now = new Date();
  const wd = chicagoWeekday(now);
  if ((wd === "Sat" || wd === "Sun") && !body.force) {
    return json({ ok: true, action: "skipped_weekend", weekday: wd });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Kill switch ────────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from("app_config").select("value").eq("key", "checkin_reminder_enabled").maybeSingle();
  if (String(cfg?.value ?? "true").trim().toLowerCase() === "false") {
    return json({ ok: true, action: "disabled" });
  }

  // ── Who has clocked in TODAY (Chicago day)? ────────────────────────
  // Day start: -05:00 is exact midnight CT during CDT; generous (11 PM
  // prior day) during CST — harmless for an AM check, techs don't clock
  // in near midnight.
  const today = chicagoDayISO(now);
  const dayStartUtc = new Date(`${today}T00:00:00-05:00`).toISOString();
  const emails = cohort.workers.map((w) => w.email);

  const clockedIn = new Set<string>();

  const { data: logs, error: logsErr } = await supabase
    .from("time_logs")
    .select("tech_email")
    .in("tech_email", emails)
    .gte("clock_in", dayStartUtc);
  if (logsErr) return json({ ok: false, error: logsErr.message }, 500);
  for (const r of logs || []) clockedIn.add(String(r.tech_email || "").toLowerCase());

  // S102 rule: union the cashiered_time_logs mirror (an RO cashiered
  // between clock-in and reminder time would hide the live row).
  const { data: mirror } = await supabase
    .from("cashiered_time_logs")
    .select("source_data")
    .gte("archived_at", dayStartUtc);
  for (const r of mirror || []) {
    const sd = (r as { source_data?: { tech_email?: string; clock_in?: string } }).source_data;
    const em = String(sd?.tech_email || "").toLowerCase();
    if (sd?.clock_in && emails.includes(em) && sd.clock_in >= dayStartUtc) clockedIn.add(em);
  }

  // ── Phones ─────────────────────────────────────────────────────────
  const { data: staff } = await supabase
    .from("staff").select("email, phone_number").eq("active", true).in("email", emails);
  const phoneByEmail = new Map(
    (staff || []).map((s) => [String(s.email || "").toLowerCase(), (s.phone_number || "").trim()]),
  );

  // ── Send ───────────────────────────────────────────────────────────
  const msg = reminderBody((body.time_label || "").trim() || cohort.timeLabel);
  const reminded: string[] = [], skipped: string[] = [], noPhone: string[] = [], failed: string[] = [];

  // manual_to: explicit recipient list, clock-in check bypassed. Staff
  // phones for non-roster emails are looked up ad hoc.
  const manualTo = (body.manual_to || []).map((e) => String(e).toLowerCase().trim()).filter(Boolean);
  let targets = cohort.workers;
  if (manualTo.length) {
    const known = new Map(
      Object.values(COHORTS).flatMap((c) => c.workers).map((w) => [w.email, w.name]),
    );
    targets = manualTo.map((email) => ({ name: known.get(email) || email, email }));
    const extra = manualTo.filter((e) => !phoneByEmail.has(e));
    if (extra.length) {
      const { data: more } = await supabase
        .from("staff").select("email, phone_number").eq("active", true).in("email", extra);
      for (const s of more || []) {
        phoneByEmail.set(String(s.email || "").toLowerCase(), (s.phone_number || "").trim());
      }
    }
  }

  for (const w of targets) {
    if (!manualTo.length && clockedIn.has(w.email)) { skipped.push(w.name); continue; }
    const phone = phoneByEmail.get(w.email) || "";
    if (!phone) { noPhone.push(w.name); console.error(`no phone for ${w.email}`); continue; }
    if (body.dry_run) { reminded.push(w.name); continue; }
    if (await textlySend(phone, msg)) reminded.push(w.name);
    else failed.push(w.name);
  }

  return json({
    ok: true,
    cohort: cohort.timeLabel,
    dry_run: !!body.dry_run,
    day: today,
    reminded, skipped_clocked_in: skipped, no_phone: noPhone, sms_failed: failed,
  });
});
