import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// ============================================================
// send-manager-report — Manager Daily Report ("AI Assistant Manager")
// REPURPOSED Session 110 (2026-06-14) per docs/specs/MANAGER_DAILY_REPORT_SPEC.md
//
// === P1 (this build): rule engine + List Activity + P&L Readiness,
//     ADMIN-PREVIEW ONLY. No manager emails are sent yet. ===
//
// One combined preview email goes to the admin recipients
// (app_config.admin_report_recipients, fallback roland@) containing
// every manager's report so Roland can validate the numbers against
// the live dashboard before P4 flips on real per-manager sends.
//
// GUIDE not JUDGE: no scoring/ranking/HR output. P&L Readiness measures
// only whether the manager did their own data job (drives data-trust gate).
//
// Determinism: every flag + number comes from the rule engine here.
// The AI narrative (P3) and guidance-log capture (P4) are NOT in P1.
//
// Guard rules (validated S109, spec sec 10.5):
//   1. Sentinel/invalid dates (year < 2020) are NOT fires — they become
//      their own readiness flag ("promised date is invalid").
//   2. Soft-deleted (deleted_at) + training (is_training) ROs are excluded
//      BEFORE anything is computed.
//
// Prior versions (GH#23 per-silo morning report) -> git history.
// ============================================================

const FN_VERSION = "v2.0-P1-preview";

const ALLOWED_ORIGIN = "https://patriotsrv.github.io";
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin":
      origin === ALLOWED_ORIGIN || origin === "http://localhost:8765" ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ── Silo display ────────────────────────────────────────────────────────
const SILO_META: Record<string, { label: string; emoji: string }> = {
  repair:        { label: "Repair",        emoji: "🔧" },
  vroom:         { label: "Vroom",         emoji: "✨" },
  solar:         { label: "Solar",         emoji: "☀️" },
  roof:          { label: "Roof",          emoji: "🏠" },
  paint_body:    { label: "Paint & Body",  emoji: "🎨" },
  chassis:       { label: "Chassis",       emoji: "🔩" },
  detailing:     { label: "Detailing",     emoji: "🧽" },
  truetopper:    { label: "TrueTopper",    emoji: "🏕️" },
  parts_insurance:{ label: "Parts & Insurance", emoji: "📦" },
};
const siloName = (k: string | null | undefined) =>
  k && SILO_META[k] ? `${SILO_META[k].emoji} ${SILO_META[k].label}` : (k || "—");

// Statuses where the RO is no longer "in the shop needing work" —
// excluded from Fire Watch (F1) and idle detection.
const DONE_STATUSES = new Set(["Delivered/Cashed Out", "Ready for pickup"]);

const MANAGER_ROLES = ["sr_manager", "manager", "parts_manager"];

// Idle threshold (D2): no labor in N working days. (Roland: 5 workdays.)
const IDLE_WORKING_DAYS = 5;
// R9 / F8 Done-Done window (D-R9, locked): 6 business days.
const DONE_DONE_BUSINESS_DAYS = 6;

const num = (v: unknown) => Number(v) || 0;
const usd = (v: unknown) =>
  "$" + num(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DASH_URL = "https://patriotsrv.github.io/rv-dashboard/";
const roLink = (code: string | null | undefined, label?: string) => {
  const c = code || "?";
  return `<a href="${DASH_URL}?ro=${encodeURIComponent(c)}" style="color:#1d4ed8;text-decoration:none;font-weight:700;">${esc(label || c)}</a>`;
};

// Inline "how to fix" breadcrumb after a flag line.
const crumb = (text: string) =>
  `<div style="font-size:11px;color:#475569;margin:1px 0 0 18px;">↳ ${text}</div>`;
// Chicago calendar date (YYYY-MM-DD) for an instant.
const ctDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// Monday (YYYY-MM-DD) of the current Chicago week.
function chicagoMondayISO(): string {
  const nowCT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  nowCT.setHours(0, 0, 0, 0);
  nowCT.setDate(nowCT.getDate() - ((nowCT.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${nowCT.getFullYear()}-${p(nowCT.getMonth() + 1)}-${p(nowCT.getDate())}`;
}

// Date string (YYYY-MM-DD, Chicago) that is n business days before today.
function businessDaysAgoISO(n: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  d.setHours(0, 0, 0, 0);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  const p = (n2: number) => String(n2).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Is a date column a real, sane date? (guard rule 1)
function validDate(s: string | null | undefined): boolean {
  if (!s) return false;
  const y = Number(String(s).slice(0, 4));
  return Number.isFinite(y) && y >= 2020 && y <= 2100;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Optional body: { manager?: email, send?: boolean }. P1 ignores `send`
    // and always routes to admin preview recipients only.
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const onlyManager: string | null = body?.manager ? String(body.manager).toLowerCase() : null;

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const todayCT = ctDate(new Date());
    const mondayISO = chicagoMondayISO();
    const idleCutoff = businessDaysAgoISO(IDLE_WORKING_DAYS);
    const doneDoneCutoff = businessDaysAgoISO(DONE_DONE_BUSINESS_DAYS); // YYYY-MM-DD
    const dateStr = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── Recipients (admin preview) ──────────────────────────────────────
    let recipients = "roland@patriotsrvservices.com";
    const { data: cfg } = await sb.from("app_config")
      .select("value").eq("key", "admin_report_recipients").maybeSingle();
    if (cfg?.value) recipients = cfg.value;

    // ── Bulk fetch ──────────────────────────────────────────────────────
    const [
      { data: staffRows },
      { data: roRows },
      { data: woRows },
      { data: partRows },
      { data: wlRows },
    ] = await Promise.all([
      sb.from("staff").select("email, name, role, service_silo, active, hourly_rate"),
      sb.from("repair_orders")
        .select("id, ro_id, customer_name, rv, status, promised_date, dollar_value, deleted_at, is_training"),
      sb.from("service_work_orders")
        .select("id, ro_id, service_silo, status, dollar_value, tech_done_at, completed_at"),
      sb.from("parts").select("id, ro_id, service_silo, status, eta, date_ordered, date_received, part_name"),
      sb.from("manager_work_lists").select("manager_email, ro_id, ro_name, service_silo, priority"),
    ]);

    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const { data: tlRows } = await sb.from("time_logs")
      .select("ro_id, tech_email, clock_in, duration_seconds")
      .gte("clock_in", eightDaysAgo);

    // ── Staff lookups ───────────────────────────────────────────────────
    const staffName: Record<string, string> = {};
    const staffRate: Record<string, number | null> = {};
    for (const s of staffRows || []) {
      const em = String(s.email || "").toLowerCase();
      if (!em) continue;
      staffName[em] = s.name || s.email;
      staffRate[em] = s.hourly_rate == null ? null : Number(s.hourly_rate);
    }
    const managers = (staffRows || [])
      .filter((s: any) => s.active && MANAGER_ROLES.includes(s.role))
      .filter((s: any) => !onlyManager || String(s.email).toLowerCase() === onlyManager);

    // ── RO lookup (apply guards: exclude deleted + training) ────────────
    const roById: Record<string, any> = {};
    for (const ro of roRows || []) {
      if (ro.deleted_at) continue;
      if (ro.is_training === true) continue;
      roById[ro.id] = ro;
    }

    // ── WOs by RO uuid ──────────────────────────────────────────────────
    const wosByRo: Record<string, any[]> = {};
    for (const w of woRows || []) (wosByRo[w.ro_id] ??= []).push(w);

    // ── Parts by RO uuid (open = not received) ──────────────────────────
    const partsByRo: Record<string, any[]> = {};
    for (const p of partRows || []) (partsByRo[p.ro_id] ??= []).push(p);

    // ── Time logs aggregated by RO uuid ─────────────────────────────────
    type TlAgg = { todayH: number; wtdH: number; h7d: number; lastDate: string; techsToday: Set<string> };
    const tlByRo: Record<string, TlAgg> = {};
    const now = Date.now();
    for (const t of tlRows || []) {
      if (!t.ro_id) continue;
      const a = tlByRo[t.ro_id] ??= { todayH: 0, wtdH: 0, h7d: 0, lastDate: "", techsToday: new Set() };
      const ci = new Date(t.clock_in);
      const d = ctDate(ci);
      const hrs = num(t.duration_seconds) / 3600;
      if (d === todayCT) { a.todayH += hrs; if (t.tech_email) a.techsToday.add(String(t.tech_email).toLowerCase()); }
      if (d >= mondayISO) a.wtdH += hrs;
      if (ci.getTime() >= now - 7 * 86_400_000) a.h7d += hrs;
      if (d > a.lastDate) a.lastDate = d;
    }

    // ── Lot-wide silo-less open parts (for parts-manager R7 list, D-parts) ─
    const siloLessOpenParts = (partRows || []).filter((p: any) =>
      !p.date_received && !p.service_silo && roById[p.ro_id]);

    // ── Work list grouped by manager (guard-filtered ROs only) ──────────
    const listByManager: Record<string, string[]> = {}; // email -> unique RO uuids
    for (const w of wlRows || []) {
      const em = String(w.manager_email || "").toLowerCase();
      if (!em) continue;
      const ro = roById[w.ro_id]; // ro_id is text holding the UUID
      if (!ro) continue;          // skip deleted/training/unknown
      const arr = (listByManager[em] ??= []);
      if (!arr.includes(ro.id)) arr.push(ro.id);
    }

    // ── Rule engine: compute one manager's report ───────────────────────
    interface Item { sev: "critical" | "warning" | "watch"; code: string; html: string }
    function computeManager(email: string) {
      const roIds = listByManager[email] || [];
      const ros = roIds.map((id) => roById[id]).filter(Boolean);

      // List Activity
      let techsToday = new Set<string>();
      let hoursToday = 0, hoursWTD = 0, hours7d = 0;
      let worked = 0, idle = 0;
      const idleList: any[] = [];
      for (const ro of ros) {
        const tl = tlByRo[ro.id];
        hoursToday += tl?.todayH || 0;
        hoursWTD += tl?.wtdH || 0;
        hours7d += tl?.h7d || 0;
        tl?.techsToday.forEach((t) => techsToday.add(t));
        const active = tl && tl.lastDate >= idleCutoff;
        const done = DONE_STATUSES.has(ro.status);
        if (active) worked++;
        else if (!done) { idle++; idleList.push(ro); }
      }

      // Readiness checks — accumulate pass/applicable + failing items
      let applicable = 0, passing = 0;
      const readyFails: Item[] = [];
      let fullyReady = 0;

      const r1NoWo: any[] = [], r2ZeroWo: any[] = [], r3NullSilo: any[] = [],
        r5NoRate = new Set<string>(), r7SiloLess: any[] = [], r8PartsNoWo: any[] = [],
        r9Stuck: any[] = [], invalidDates: any[] = [];
      let r7PartCount = 0;

      for (const ro of ros) {
        const wos = wosByRo[ro.id] || [];
        const openParts = (partsByRo[ro.id] || []).filter((p: any) => !p.date_received);
        let roOk = true;

        // R1 — has at least one WO
        applicable++;
        if (wos.length === 0) { r1NoWo.push(ro); roOk = false; }
        else passing++;

        if (wos.length > 0) {
          // R2 — every WO valued
          applicable++;
          if (wos.some((w) => num(w.dollar_value) === 0)) { r2ZeroWo.push(ro); roOk = false; }
          else passing++;
          // R3 — every WO has a silo
          applicable++;
          if (wos.some((w) => !w.service_silo)) { r3NullSilo.push(ro); roOk = false; }
          else passing++;
          // R9 — no tech-done WO stuck > 6 business days
          const stuck = wos.some((w) => w.tech_done_at && !w.completed_at &&
            ctDate(new Date(w.tech_done_at)) < doneDoneCutoff);
          applicable++;
          if (stuck) { r9Stuck.push(ro); roOk = false; }
          else passing++;
        }

        // R7 — every open part has a silo
        if (openParts.length > 0) {
          applicable++;
          const siloLess = openParts.filter((p: any) => !p.service_silo);
          if (siloLess.length) { r7SiloLess.push(ro); r7PartCount += siloLess.length; roOk = false; }
          else passing++;
          // R8 — parts only on ROs that have a WO to book against
          applicable++;
          if (wos.length === 0) { r8PartsNoWo.push(ro); roOk = false; }
          else passing++;
        }

        // Invalid promised date (guard rule 1 -> its own readiness flag)
        if (ro.promised_date && !validDate(ro.promised_date)) { invalidDates.push(ro); roOk = false; }

        if (roOk) fullyReady++;
      }

      // R5 — techs who logged time on these ROs have an hourly_rate set
      const techsOnList = new Set<string>();
      for (const ro of ros) {
        for (const t of tlRows || []) {
          if (t.ro_id === ro.id && t.tech_email) techsOnList.add(String(t.tech_email).toLowerCase());
        }
      }
      for (const te of techsOnList) if (staffRate[te] == null) r5NoRate.add(te);

      // Fire Watch (computed in P1; rendered as a compact preview line)
      const fires: Item[] = [];
      for (const ro of ros) {
        if (DONE_STATUSES.has(ro.status)) continue;
        if (ro.promised_date && validDate(ro.promised_date) && ro.promised_date <= todayCT) {
          fires.push({ sev: "critical", code: "F1",
            html: `${roLink(ro.ro_id, ro.customer_name || ro.ro_id)} — promised ${esc(ro.promised_date)} (due/overdue), status ${esc(ro.status)}`
              + crumb("Open the RO. If the work is finished, set status to Ready for pickup. If not, get a tech on it today and update the promised date to a real date you can hit.") });
        }
        const openParts = (partsByRo[ro.id] || []).filter((p: any) => !p.date_received);
        const pastEta = openParts.filter((p: any) => p.eta && validDate(p.eta) && p.eta < todayCT);
        if (pastEta.length) {
          fires.push({ sev: "warning", code: "F4",
            html: `${roLink(ro.ro_id, ro.customer_name || ro.ro_id)} — ${pastEta.length} part${pastEta.length > 1 ? "s" : ""} past ETA`
              + crumb("Open the RO and go to Parts. Call the supplier, then update the ETA to the new date, or mark the part Received if it has arrived.") });
        }
      }

      // Build readiness fail items (dollar/action framed, deep-linked)
      const mkList = (ros2: any[]) => ros2.slice(0, 12).map((r) => roLink(r.ro_id, r.customer_name || r.ro_id)).join(", ");
      if (r1NoWo.length) readyFails.push({ sev: "critical", code: "R1",
        html: `<b>${r1NoWo.length} RO${r1NoWo.length > 1 ? "s have" : " has"} no Work Order</b> — revenue is invisible to the P&L: ${mkList(r1NoWo)}`
          + crumb("Open the RO, go to Work Orders, and Build a Work Order. Give it a Dollar Value and pick the right service silo.") });
      if (r2ZeroWo.length) readyFails.push({ sev: "warning", code: "R2",
        html: `<b>${r2ZeroWo.length} RO${r2ZeroWo.length > 1 ? "s have" : " has"} a $0 / unpriced WO</b> — labor with no margin to measure: ${mkList(r2ZeroWo)}`
          + crumb("Open the RO, go to Work Orders, and type the Dollar Value (what the customer is being charged) into the work order.") });
      if (r3NullSilo.length) readyFails.push({ sev: "warning", code: "R3",
        html: `<b>${r3NullSilo.length} WO${r3NullSilo.length > 1 ? "s" : ""} missing a service silo</b> — revenue lands in the wrong place: ${mkList(r3NullSilo)}`
          + crumb("Open the RO, go to Work Orders, and choose the Service Silo (Repair, Roof, Solar, Vroom, Paint & Body, etc.) for the work order.") });
      if (r7SiloLess.length) readyFails.push({ sev: "warning", code: "R7",
        html: `<b>${r7PartCount} open part${r7PartCount > 1 ? "s" : ""} across ${r7SiloLess.length} RO${r7SiloLess.length > 1 ? "s" : ""} have no service silo</b> — feeds the Unattributed cost row: ${mkList(r7SiloLess)}`
          + crumb("Open the RO, go to Parts, and set the Service Silo on each part so its cost lands on the right team.") });
      if (r8PartsNoWo.length) readyFails.push({ sev: "watch", code: "R8",
        html: `${r8PartsNoWo.length} RO${r8PartsNoWo.length > 1 ? "s have" : " has"} parts but no WO to book them against: ${mkList(r8PartsNoWo)}`
          + crumb("Open the RO and add a Work Order. The parts need a work order to attach their cost to.") });
      if (r9Stuck.length) readyFails.push({ sev: "watch", code: "R9",
        html: `<b>${r9Stuck.length} WO${r9Stuck.length > 1 ? "s" : ""} tech-done but not marked Done-Done &gt; ${DONE_DONE_BUSINESS_DAYS} business days</b> — earned revenue not recognized: ${mkList(r9Stuck)}`
          + crumb("Open the RO, go to Work Orders, check the tech's finished work, then click Mark Completed. That is what counts the revenue.") });
      if (r5NoRate.size) readyFails.push({ sev: "watch", code: "R5",
        html: `${r5NoRate.size} tech${r5NoRate.size > 1 ? "s" : ""} who logged time have no hourly rate — their labor cost reads $0: ${[...r5NoRate].map((e) => esc(staffName[e] || e)).join(", ")}`
          + crumb("Ask an admin to open Admin Settings, find the tech under Staff, and enter their hourly rate.") });
      if (invalidDates.length) readyFails.push({ sev: "watch", code: "DATE",
        html: `<b>${invalidDates.length} RO${invalidDates.length > 1 ? "s have" : " has"} an invalid promised date</b> (fix it — not counted as a fire): ${mkList(invalidDates)}`
          + crumb("Open the RO and set a real promised date (or clear the bad one). A blank date is fine; a year like 0001 is not.") });

      const readinessPct = ros.length ? Math.round((fullyReady / ros.length) * 100) : 100;
      const checkPct = applicable ? Math.round((passing / applicable) * 100) : 100;

      return {
        roCount: ros.length, techsToday: techsToday.size,
        hoursToday, hoursWTD, hours7d, worked, idle, idleList,
        readinessPct, checkPct, fullyReady, applicable, passing,
        readyFails, fires,
      };
    }

    // ── Build per-manager sections ──────────────────────────────────────
    const sevColor = (s: string) => s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : "#6b7280";
    const sevDot = (s: string) => `<span style="color:${sevColor(s)};">${s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🟡"}</span>`;

    const card = (label: string, value: string, color = "#1e293b") =>
      `<td style="padding:8px 4px;text-align:center;"><div style="font-size:18px;font-weight:800;color:${color};">${value}</div><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div></td>`;

    let sections = "";
    let managersWithList = 0;
    const summaryRows: string[] = [];

    for (const m of managers.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))) {
      const email = String(m.email).toLowerCase();
      const r = computeManager(email);
      const isParts = m.role === "parts_manager";

      // Skip silo/sr managers with empty lists (nothing to preview) — but
      // always render parts managers (they get the lot-wide silo-less list).
      if (r.roCount === 0 && !isParts) continue;
      managersWithList++;

      const readyColor = r.readinessPct >= 90 ? "#16a34a" : r.readinessPct >= 70 ? "#d97706" : "#dc2626";
      summaryRows.push(`<tr>
        <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;"><b>${esc(m.name)}</b> <span style="color:#94a3b8;">${esc(m.role)}</span></td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;">${r.roCount}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;">${r.hours7d.toFixed(1)}h</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${r.idle ? "#d97706" : "#16a34a"};font-weight:700;">${r.idle}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${readyColor};font-weight:800;">${r.readinessPct}%</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${r.fires.length ? "#dc2626" : "#16a34a"};font-weight:700;">${r.fires.length}</td>
      </tr>`);

      // List Activity scorecard
      const activity = `<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:8px 0 12px;"><tr>
        ${card("ROs on list", String(r.roCount))}
        ${card("Techs today", String(r.techsToday), r.techsToday ? "#16a34a" : "#94a3b8")}
        ${card("Hours today", r.hoursToday.toFixed(1))}
        ${card("Hours WTD", r.hoursWTD.toFixed(1))}
        ${card("Worked / Idle", `${r.worked} / ${r.idle}`, r.idle ? "#d97706" : "#16a34a")}
        ${card("P&L Ready", `${r.readinessPct}%`, readyColor)}
      </tr></table>`;

      // Idle group (the "easy vs hard" tell) — grouped box + plain footer
      const idleHtml = r.idleList.length
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:0 0 12px;">
             <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:5px;">🕒 Idle ROs (${r.idleList.length}) — no tech time in ${IDLE_WORKING_DAYS} work days</div>
             ${r.idleList.slice(0, 25).map((ro) => `<div style="font-size:12px;margin-bottom:3px;line-height:1.45;">🟡 ${roLink(ro.ro_id, ro.customer_name || ro.ro_id)} <span style="color:#64748b;">— status ${esc(ro.status || "—")}</span></div>`).join("")}
           </div>`
        : `<div style="font-size:12px;color:#16a34a;margin:0 0 12px;">✅ Every RO on the list got tech time within the last ${IDLE_WORKING_DAYS} work days.</div>`;

      // Fire Watch preview (P2 will color-band + expand)
      const fireHtml = r.fires.length
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 12px;">
             <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:5px;">🔥 Fire Watch (${r.fires.length})</div>
             ${r.fires.slice(0, 15).map((f) => `<div style="font-size:12px;margin-bottom:5px;line-height:1.45;">${sevDot(f.sev)} ${f.html}</div>`).join("")}
           </div>`
        : `<div style="font-size:12px;color:#16a34a;margin:0 0 12px;">✅ No fires on this list today.</div>`;

      // P&L Readiness fails
      const readyHtml = r.readyFails.length
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:0 0 8px;">
             <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:5px;">📋 P&L Readiness — fix these (${r.passing}/${r.applicable} checks pass)</div>
             ${r.readyFails.map((f) => `<div style="font-size:12px;margin-bottom:5px;line-height:1.45;">${sevDot(f.sev)} ${f.html}</div>`).join("")}
           </div>`
        : `<div style="font-size:12px;color:#16a34a;margin:0 0 8px;">✅ P&L Readiness 100% — every applicable data check passes.</div>`;

      // Parts manager: lot-wide silo-less open parts (R7, D-parts)
      let partsExtra = "";
      if (isParts) {
        const byRo: Record<string, number> = {};
        for (const p of siloLessOpenParts) byRo[p.ro_id] = (byRo[p.ro_id] || 0) + 1;
        const entries = Object.entries(byRo).sort((a, b) => b[1] - a[1]);
        partsExtra = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin:0 0 8px;">
          <div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:5px;">📦 Lot-wide: ${siloLessOpenParts.length} open part${siloLessOpenParts.length !== 1 ? "s" : ""} with NO service silo (across ${entries.length} RO${entries.length !== 1 ? "s" : ""})</div>
          <div style="font-size:12px;line-height:1.5;">${entries.slice(0, 20).map(([id, n]) => { const ro = roById[id]; return `${roLink(ro?.ro_id, ro?.customer_name || ro?.ro_id)} (${n})`; }).join(", ")}${entries.length > 20 ? " …" : ""}</div>
          <div style="font-size:11px;color:#64748b;margin-top:5px;">These drive the Unattributed cost row. Assign each part's silo from the RO → Parts form.</div>
        </div>`;
      }

      sections += `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:16px;font-weight:800;color:#1e3a5f;">👤 ${esc(m.name)} <span style="font-weight:600;color:#64748b;font-size:12px;">· ${esc(m.role)}${m.service_silo ? " · " + esc(siloName(m.service_silo)) : ""}</span></div>
        ${activity}${idleHtml}${fireHtml}${readyHtml}${partsExtra}
      </div>`;
    }

    // ── Assemble preview email ──────────────────────────────────────────
    const th = `padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:#555;border-bottom:1px solid #e5e7eb;background:#f9fafb;`;
    const summaryTable = `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead><tr><th style="${th}">Manager</th><th style="${th}text-align:right;">ROs</th><th style="${th}text-align:right;">Hrs 7d</th><th style="${th}text-align:right;">Idle</th><th style="${th}text-align:right;">P&L Ready</th><th style="${th}text-align:right;">Fires</th></tr></thead>
      <tbody>${summaryRows.join("")}</tbody></table>`;

    const previewBanner = `<div style="background:#1e293b;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
      <div style="color:#fbbf24;font-size:13px;font-weight:800;">🧭 ADMIN PREVIEW — Manager Daily Report (P1)</div>
      <div style="color:#cbd5e1;font-size:12px;margin-top:4px;line-height:1.5;">This is the rule-engine preview. <b>No emails were sent to managers.</b> Validate these numbers against the live dashboard. GUIDE-not-JUDGE — no scoring or ranking. AI narrative (P3) and per-manager sends (P4) come next.</div>
    </div>`;

    const legend = `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:18px;background:#fafafa;">
      <div style="font-size:13px;font-weight:800;color:#1e3a5f;margin-bottom:6px;">📖 How to read each manager's report</div>
      <div style="font-size:12px;color:#334155;line-height:1.55;">
        <b>🕒 Idle ROs</b> — on your work list but no tech time in ${IDLE_WORKING_DAYS} work days. Get an RO off the list by: (1) making sure a tech clocks in; (2) if it is a placeholder, opening the RO and using the <b>Schedule</b> button to put it on the calendar; (3) if it is waiting on parts or an approval, setting the status correctly (Awaiting parts / Awaiting Approval); or (4) removing it from the list if it is not yours right now.<br>
        <b>🔥 Fire Watch</b> — a promised date has passed or a part is late. <b style="color:#dc2626;">🔴 = handle today</b>, <b style="color:#d97706;">🟠 = handle this week</b>. The <b>↳</b> note under each line is the exact fix.<br>
        <b>📋 P&L Readiness</b> — The RO(s) Work Order estimated value data that is used to calculate P&L has not been set yet. The <b>↳</b> note under each line says exactly where to click. A higher % means the team's numbers can be trusted.
      </div>
    </div>`;

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:18px;">
    <h1 style="color:#1e3a5f;margin:0;font-size:20px;">🧭 Manager Daily Report — Preview</h1>
    <p style="margin:4px 0 0;color:#555;font-size:13px;">Patriots RV Services · ${dateStr} · Week of ${mondayISO} · ${FN_VERSION}</p>
  </div>
  ${previewBanner}
  ${legend}
  <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 6px;">Summary — ${managersWithList} manager${managersWithList !== 1 ? "s" : ""}</h2>
  ${summaryTable}
  ${sections || `<p style="font-size:13px;color:#64748b;">No managers with active work lists.</p>`}
  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#888;font-size:11px;">Guards active: invalid dates (year &lt; 2020) flagged not fired; soft-deleted + training ROs excluded. Idle = no labor in ${IDLE_WORKING_DAYS} working days. Done-Done window ${DONE_DONE_BUSINESS_DAYS} business days. P&L Readiness checks: R1 has WO · R2 WO valued · R3 WO silo · R5 tech rate · R7 part silo · R8 part has WO · R9 Done-Done.<br>
    ${FN_VERSION} · generated automatically by the PRVS Dashboard. Spec: docs/specs/MANAGER_DAILY_REPORT_SPEC.md</p>
  </div>
</body></html>`;

    // ── Send the single preview email to admins ─────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const subject = `🧭 Manager Report PREVIEW (P1) — ${dateStr} — ${managersWithList} managers`;
    await transporter.sendMail({
      from: `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to: recipients, subject,
      text: `Manager Daily Report PREVIEW (P1) — ${dateStr}\n${managersWithList} managers with active lists. Admin-preview only; no manager emails sent.\nSee the HTML version for the rule-engine detail.`,
      html: htmlBody,
    });

    const summary = {
      success: true, version: FN_VERSION, mode: "admin-preview",
      recipients, managersRendered: managersWithList,
    };
    console.log("send-manager-report (P1 preview) sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-manager-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
