import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// ============================================================
// send-dropoff-report — Monday Drop-Off Heads-Up  [ER 7f2d0d70 S128]
//
// Lynn's ask + Roland's S128 refinement: the Monday-morning email's PRIMARY job
// is to give techs + managers a heads-up on what is DROPPING OFF THIS WEEK, with
// last week's received drop-offs kept below as a reconciliation ("did each one
// land on the right team's work list?").
//
// Two sections:
//   1) COMING IN THIS WEEK (top) — ROs with planned_dropoff_date in the current
//      Mon–Sun week. The forward-looking heads-up.
//   2) RECEIVED LAST WEEK (bottom) — ROs with date_received in the prior Mon–Sun
//      week, each flagged on / not-yet-on the respective team's work list.
//
// Both sections are grouped by service silo and show the work-list coverage so
// the team can pre-add upcoming units and backfill any that slipped through.
// Pairs with ER cbc70a86 (check-in now auto-adds to work lists).
//
// Modes (mirrors send-manager-report):
//   * Default / cron with no body  -> ADMIN PREVIEW: one email to
//     app_config.admin_report_recipients (fallback roland@). Safe to test-fire.
//   * POST { send: true } + X-PRVS-Secret == PRVS_FUNCTION_SECRET -> sends to
//     all managers + sr_managers + parts_managers.
//
// Guards: soft-deleted (deleted_at) + training (is_training) ROs excluded.
// Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
// ============================================================

const FN_VERSION = "v1.2";

const ALLOWED_ORIGIN = "https://patriotsrv.github.io";
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin":
      origin === ALLOWED_ORIGIN || origin === "http://localhost:8765" ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prvs-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Silo definitions (mirror js/config.js SERVICE_SILOS + REPAIR_TYPE_TO_SILO)
const SERVICE_SILOS: { key: string; label: string; emoji: string }[] = [
  { key: "repair",     label: "Repair",       emoji: "🔧" },
  { key: "vroom",      label: "Vroom",        emoji: "✨" },
  { key: "solar",      label: "Solar",        emoji: "☀️" },
  { key: "roof",       label: "Roof",         emoji: "🏠" },
  { key: "paint_body", label: "Paint & Body", emoji: "🎨" },
  { key: "chassis",    label: "Chassis",      emoji: "🔩" },
  { key: "detailing",  label: "Detailing",    emoji: "🧽" },
  { key: "truetopper", label: "TrueTopper",   emoji: "🏕️" },
];
const REPAIR_TYPE_TO_SILO: Record<string, string> = {
  "repairs": "repair", "repair": "repair", "vroom": "vroom", "solar": "solar",
  "roof": "roof", "paint and body": "paint_body", "paint & body": "paint_body",
  "chassis": "chassis", "detailing": "detailing", "truetopper": "truetopper",
};
const siloInfo = (k: string) => SERVICE_SILOS.find((s) => s.key === k);

function ctISO(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function chicagoMondayISO(now: Date): string {
  const todayISO = ctISO(now);
  const dow = new Date(new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }))).getDay();
  const back = dow === 0 ? 6 : dow - 1; // days since Monday
  return addDaysISO(todayISO, -back);
}
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtShort = (s: string) => {
  try {
    return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "America/Chicago",
    });
  } catch { return s; }
};

type Item = { ro: any; covered: boolean; haveNames: string[]; needNames: string[] };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    let body: any = null;
    try { body = await req.json(); } catch { /* no body */ }
    const wantSend = body?.send === true;

    if (wantSend) {
      const expected = Deno.env.get("PRVS_FUNCTION_SECRET");
      const provided = req.headers.get("x-prvs-secret") || "";
      if (!expected || provided !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized — send mode requires a valid X-PRVS-Secret header" }),
          { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── Windows (Chicago) ───────────────────────────────────────────────
    const now = new Date();
    const thisMonISO = chicagoMondayISO(now);
    const thisSunISO = addDaysISO(thisMonISO, 6);   // current week Mon..Sun
    const lastStart  = addDaysISO(thisMonISO, -7);  // previous Monday
    const lastEnd    = addDaysISO(thisMonISO, -1);  // previous Sunday
    const thisLabel  = `${fmtShort(thisMonISO)} – ${fmtShort(thisSunISO)}`;
    const lastLabel  = `${fmtShort(lastStart)} – ${fmtShort(lastEnd)}`;
    const dateStr = now.toLocaleDateString("en-US", {
      timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── Fetch both week sets + staff ────────────────────────────────────
    const [{ data: thisRows }, { data: lastRows }, { data: staffRows }] = await Promise.all([
      sb.from("repair_orders")
        .select("id, ro_id, customer_name, rv, repair_type, planned_dropoff_date, date_received, status, deleted_at, is_training")
        .gte("planned_dropoff_date", thisMonISO)
        .lte("planned_dropoff_date", thisSunISO)
        .is("deleted_at", null)
        .order("planned_dropoff_date", { ascending: true }),
      sb.from("repair_orders")
        .select("id, ro_id, customer_name, rv, repair_type, planned_dropoff_date, date_received, status, deleted_at, is_training")
        .gte("date_received", lastStart)
        .lte("date_received", lastEnd)
        .is("deleted_at", null)
        .order("date_received", { ascending: true }),
      sb.from("staff").select("email, name, role, service_silo, active"),
    ]);

    const thisWeek = (thisRows || []).filter((r: any) => r.is_training !== true);
    const lastWeek = (lastRows || []).filter((r: any) => r.is_training !== true);

    // staff maps
    const nameByEmail: Record<string, string> = {};
    for (const s of (staffRows || [])) {
      if (s.email) nameByEmail[String(s.email).toLowerCase()] = s.name || String(s.email).split("@")[0];
    }
    const nm = (email: string) => nameByEmail[String(email).toLowerCase()] || String(email).split("@")[0];
    const leadsBySilo: Record<string, string[]> = {};
    const srManagers: string[] = [];
    for (const s of (staffRows || [])) {
      if (s.active === false || !s.email) continue;
      if (s.role === "sr_manager") srManagers.push(s.email);
      if (["manager", "sr_manager", "parts_manager"].includes(s.role) && s.service_silo) {
        (leadsBySilo[s.service_silo] ||= []).push(s.email);
      }
    }
    const targetsForSilo = (silo: string) =>
      (leadsBySilo[silo] && leadsBySilo[silo].length) ? leadsBySilo[silo] : srManagers;

    // work-list rows for the union of both sets (ro_id is TEXT holding the UUID)
    const allIds = [...new Set([...thisWeek, ...lastWeek].map((r: any) => String(r.id)))];
    const wlByRo: Record<string, { email: string; silo: string | null }[]> = {};
    if (allIds.length) {
      const { data: wlRows } = await sb.from("manager_work_lists")
        .select("manager_email, ro_id, service_silo")
        .in("ro_id", allIds);
      for (const w of (wlRows || [])) {
        (wlByRo[String(w.ro_id)] ||= []).push({ email: w.manager_email, silo: w.service_silo });
      }
    }

    // ── Build per-silo coverage for a set ───────────────────────────────
    function buildSections(roList: any[]) {
      const bySilo: Record<string, Item[]> = {};
      let uncovered = 0, pairCount = 0;
      for (const ro of roList) {
        const keys = String(ro.repair_type || "")
          .split(",").map((t) => REPAIR_TYPE_TO_SILO[t.trim().toLowerCase()]).filter(Boolean);
        const list = keys.length ? [...new Set(keys)] : ["_unassigned"];
        for (const silo of list) {
          pairCount++;
          const wl = wlByRo[String(ro.id)] || [];
          const targets = silo === "_unassigned" ? srManagers : targetsForSilo(silo);
          const targetSet = new Set(targets.map((e) => e.toLowerCase()));
          const have = wl.filter((w) =>
            (silo !== "_unassigned" && w.silo === silo) ||
            targetSet.has(String(w.email).toLowerCase()));
          const covered = have.length > 0;
          if (!covered) uncovered++;
          (bySilo[silo] ||= []).push({
            ro, covered,
            haveNames: [...new Set(have.map((w) => nm(w.email)))],
            needNames: [...new Set(targets.map((e) => nm(e)))],
          });
        }
      }
      return { bySilo, uncovered, pairCount };
    }
    const thisSec = buildSections(thisWeek);
    const lastSec = buildSections(lastWeek);

    // ── Renderers ───────────────────────────────────────────────────────
    // dateMode: "planned" (this week, "arriving") or "received" (last week)
    const rowHtml = (it: Item, dateMode: "planned" | "received") => {
      const r = it.ro;
      const dateVal = dateMode === "planned" ? r.planned_dropoff_date : r.date_received;
      const verb = dateMode === "planned" ? "arriving" : "received";
      const badge = it.covered
        ? `<span style="color:#15803d;font-weight:700">✅ on ${esc(it.haveNames.join(", "))}'s list</span>`
        : `<span style="color:#b91c1c;font-weight:700">⚠️ NOT on a list</span> <span style="color:#6b7280">— add for ${esc(it.needNames.join(", ") || "a manager")}</span>`;
      return `<div style="padding:8px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;line-height:1.5">
        <strong>${esc(r.customer_name || r.ro_id || "RO")}</strong>${r.rv ? " — " + esc(r.rv) : ""}
        <span style="color:#6b7280">(${verb} ${dateVal ? fmtShort(dateVal) : "—"}${r.status ? " · " + esc(r.status) : ""})</span><br>${badge}</div>`;
    };
    const siloSection = (sec: ReturnType<typeof buildSections>, key: string, dateMode: "planned" | "received") => {
      const info = key === "_unassigned" ? { emoji: "❓", label: "Unassigned (no service type)" } : siloInfo(key)!;
      const items = sec.bySilo[key];
      const bad = items.filter((i) => !i.covered).length;
      const hdrColor = bad > 0 ? "#b45309" : "#15803d";
      return `<div style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden">
        <div style="background:#f9fafb;padding:10px 14px;border-bottom:1px solid #e5e7eb">
          <span style="font-size:16px;font-weight:800;color:${hdrColor}">${info.emoji} ${esc(info.label)}</span>
          <span style="margin-left:8px;color:#6b7280;font-size:13px">${items.length} unit${items.length > 1 ? "s" : ""}${bad ? ` · ${bad} to add` : ""}</span>
        </div>${items.map((it) => rowHtml(it, dateMode)).join("")}</div>`;
    };
    const sectionBlock = (sec: ReturnType<typeof buildSections>, dateMode: "planned" | "received", emptyMsg: string) => {
      const ordered = [...SERVICE_SILOS.map((s) => s.key), "_unassigned"].filter((k) => sec.bySilo[k]?.length);
      if (!ordered.length) {
        return `<div style="padding:12px 14px;color:#6b7280;font-size:14px;font-style:italic">${emptyMsg}</div>`;
      }
      return ordered.map((k) => siloSection(sec, k, dateMode)).join("");
    };

    const thisCount = thisWeek.length;
    const headThis = thisCount === 0
      ? `<div style="background:#f8fafc;border:2px solid #cbd5e1;border-radius:12px;padding:16px;margin-bottom:8px;text-align:center"><div style="font-size:19px;font-weight:800;color:#475569">No drop-offs scheduled this week</div><div style="color:#64748b;font-size:14px;margin-top:3px">${thisLabel}</div></div>`
      : `<div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:16px;margin-bottom:8px;text-align:center"><div style="font-size:21px;font-weight:800;color:#1d4ed8">📥 ${thisCount} RV${thisCount > 1 ? "s" : ""} coming in this week</div><div style="color:#1e40af;font-size:14px;margin-top:3px">Scheduled drop-offs for ${thisLabel}. Heads-up for your team.</div></div>`;
    const headLast = lastWeek.length === 0
      ? `<div style="background:#f8fafc;border:2px solid #cbd5e1;border-radius:12px;padding:16px;margin-bottom:8px;text-align:center"><div style="font-size:19px;font-weight:800;color:#475569">No drop-offs received last week</div><div style="color:#64748b;font-size:14px;margin-top:3px">${lastLabel}</div></div>`
      : lastSec.uncovered === 0
        ? `<div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:16px;margin-bottom:8px;text-align:center"><div style="font-size:21px;font-weight:800;color:#15803d">✅ All ${lastWeek.length} on a work list</div><div style="color:#166534;font-size:14px;margin-top:3px">Received ${lastLabel}. Nothing to add.</div></div>`
        : `<div style="background:#fff7ed;border:2px solid #f97316;border-radius:12px;padding:16px;margin-bottom:8px;text-align:center"><div style="font-size:21px;font-weight:800;color:#9a3412">⚠️ ${lastSec.uncovered} from last week not yet on a team list</div><div style="color:#9a3412;font-size:14px;margin-top:3px">Received ${lastLabel}. Add the flagged ones below.</div></div>`;

    const secTitle = (txt: string) =>
      `<div style="font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#334155;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #e5e7eb">${txt}</div>`;

    const GUIDE_URL = "https://patriotsrv.github.io/rv-dashboard/guide.html#rb-active";
    const guideBanner = `<a href="${GUIDE_URL}" style="display:block;text-decoration:none;background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;padding:12px 16px;margin-bottom:16px;text-align:center;color:#1d4ed8;font-size:15px;font-weight:800">📖 What is this? Click here for how the Work List works</a>`;

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#1a1a1a;background:#fff"><div style="border-bottom:3px solid #c8102e;padding-bottom:12px;margin-bottom:16px"><h1 style="color:#c8102e;margin:0;font-size:20px">Patriots RV — Monday Drop-Off Check</h1><p style="margin:4px 0 0;color:#555;font-size:13px">Week of ${thisLabel} &middot; ${dateStr}</p></div>${guideBanner}${secTitle("📥 Coming in this week")}${headThis}${sectionBlock(thisSec, "planned", "Nothing on the schedule to drop off this week yet.")}<div style="height:22px"></div>${secTitle("✅ Received last week — confirm on a work list")}${headLast}${sectionBlock(lastSec, "received", "Nothing was received last week.")}<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb"><p style="margin:0;color:#888;font-size:11px">Open the dashboard: <a href="https://patriotsrv.github.io/rv-dashboard/" style="color:#c8102e">patriotsrv.github.io/rv-dashboard</a><br>Patriots RV Services &middot; Denton, TX &middot; (940) 488-5047 &middot; Automated Monday drop-off heads-up</p></div></body></html>`;

    // ── Plain text ──────────────────────────────────────────────────────
    const plainSection = (sec: ReturnType<typeof buildSections>, dateMode: "planned" | "received", emptyMsg: string) => {
      const ordered = [...SERVICE_SILOS.map((s) => s.key), "_unassigned"].filter((k) => sec.bySilo[k]?.length);
      if (!ordered.length) return ["  " + emptyMsg];
      const out: string[] = [];
      for (const key of ordered) {
        const info = key === "_unassigned" ? { label: "Unassigned" } : siloInfo(key)!;
        out.push(`  ${info.label}:`);
        for (const it of sec.bySilo[key]) {
          const dv = dateMode === "planned" ? it.ro.planned_dropoff_date : it.ro.date_received;
          out.push(`    - ${it.ro.customer_name || it.ro.ro_id} (${dv ? fmtShort(dv) : "-"}) ${it.covered ? "OK on " + it.haveNames.join(", ") : "ADD for " + (it.needNames.join(", ") || "a manager")}`);
        }
      }
      return out;
    };
    const plainText = [
      `PRVS MONDAY DROP-OFF CHECK — week of ${thisLabel}`,
      ``,
      `COMING IN THIS WEEK (${thisCount}):`,
      ...plainSection(thisSec, "planned", "None scheduled this week yet."),
      ``,
      `RECEIVED LAST WEEK (${lastWeek.length}; ${lastSec.uncovered} not yet on a list):`,
      ...plainSection(lastSec, "received", "None received last week."),
      ``,
      `Open dashboard: https://patriotsrv.github.io/rv-dashboard/`,
    ].join("\n");

    // ── Recipients ──────────────────────────────────────────────────────
    let recipients: string[];
    if (wantSend) {
      recipients = [...new Set((staffRows || [])
        .filter((s: any) => s.active !== false && s.email &&
          ["sr_manager", "manager", "parts_manager"].includes(s.role))
        .map((s: any) => s.email))];
    } else {
      let adminCsv = "roland@patriotsrvservices.com";
      const { data: cfg } = await sb.from("app_config")
        .select("value").eq("key", "admin_report_recipients").maybeSingle();
      if (cfg?.value) adminCsv = cfg.value;
      recipients = adminCsv.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    if (!recipients.length) {
      return new Response(JSON.stringify({ error: "No recipients" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const subject = thisCount === 0
      ? `PRVS Drop-Off Check — none scheduled this week${lastSec.uncovered ? ` (${lastSec.uncovered} to add from last week)` : ""}`
      : `PRVS Drop-Off Check — ${thisCount} coming in this week`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to:      recipients.join(", "),
      subject, text: plainText, html: htmlBody,
    });

    const summary = {
      success: true, version: FN_VERSION, mode: wantSend ? "send" : "admin-preview",
      thisWeek: thisLabel, comingIn: thisCount,
      lastWeek: lastLabel, receivedLastWeek: lastWeek.length, lastWeekUncovered: lastSec.uncovered,
      recipients: recipients.length,
    };
    console.log("Drop-off report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (err) {
    console.error("send-dropoff-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
