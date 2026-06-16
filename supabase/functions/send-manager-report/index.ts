import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// ============================================================
// send-manager-report — Manager Daily Report ("AI Assistant Manager")
// REPURPOSED Session 110 (2026-06-14) per docs/specs/MANAGER_DAILY_REPORT_SPEC.md
//
// === P1: rule engine + List Activity + P&L Readiness. ===
//   Default / cron path = ADMIN-PREVIEW: one combined preview email to the
//   admin recipients (app_config.admin_report_recipients, fallback roland@)
//   containing every manager's report so Roland can validate the numbers.
//
// === P4 send mode (Session 111, 2026-06-16): POST { send: true } ===
//   Emails EACH active manager their OWN scoped card (no cross-manager
//   summary/ranking — GUIDE not JUDGE), with admins (Roland + Lynn) CC'd on
//   every one (D4). GATED behind the X-PRVS-Secret header so real manager
//   sends can never be fired anonymously. The cron keeps firing the open
//   admin-preview path; per-manager send is a deliberate, authenticated call.
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

const FN_VERSION = "v2.1-P4";

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
// S113: Employee Guide deep-links. Each report block links to its own #rb-* anchor.
const GUIDE_URL = DASH_URL + "guide.html";
const guideLink = (anchor: string) =>
  `<a href="${GUIDE_URL}#${anchor}" style="color:#1d4ed8;text-decoration:none;font-weight:600;font-size:11px;white-space:nowrap;">&#128218; Guide &rsaquo;</a>`;
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

    // Optional body: { manager?: email, send?: boolean }.
    //   send !== true  -> admin-preview (default; the cron path)
    //   send === true  -> per-manager send (P4), GATED behind X-PRVS-Secret
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const onlyManager: string | null = body?.manager ? String(body.manager).toLowerCase() : null;
    const wantSend = body?.send === true;

    // ── SHARED-SECRET GATE — required for real per-manager sends only ───
    // Admin-preview stays open (it only emails admins, and the cron fires it
    // with just the anon Bearer). Per-manager send MUST present a matching
    // X-PRVS-Secret; if the secret isn't configured at all, send mode refuses
    // (fail safe — never blast managers unauthenticated).
    if (wantSend) {
      const expectedSecret = Deno.env.get("PRVS_FUNCTION_SECRET");
      const providedSecret = req.headers.get("x-prvs-secret") || "";
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized — per-manager send requires a valid X-PRVS-Secret header" }),
          { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    }

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
      sb.from("parts").select("id, ro_id, service_silo, status, eta, date_ordered, date_received, part_name, wholesale_price, qty, core_charge"),
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

    // Shop Operations ROs (internal overhead). Their parts are EXCLUDED from
    // the parts-manager's silo-less action list — there is no "overhead" parts
    // silo yet, so they'd never clear. Shop spend is surfaced to admins only
    // (see the admin Shop-parts-spend box) for daily abuse-watch.
    const shopRoIds = new Set<string>();
    for (const id in roById) {
      if (String(roById[id].customer_name || "").toLowerCase().includes("shop operations")) shopRoIds.add(id);
    }

    // ── Lot-wide silo-less open parts (for parts-manager R7 list, D-parts) ─
    // Excludes Shop Operations / overhead parts.
    const siloLessOpenParts = (partRows || []).filter((p: any) =>
      !p.date_received && !p.service_silo && roById[p.ro_id] && !shopRoIds.has(p.ro_id));

    // ── Shop parts spend (admin-only overhead watch) ────────────────────
    const partCost = (p: any) => num(p.wholesale_price) * (num(p.qty) || 1) + num(p.core_charge);
    const sevenDaysAgoISO = ctDate(new Date(Date.now() - 7 * 86_400_000));
    let shopTodayN = 0, shopTodayCost = 0, shopWtdN = 0, shopWtdCost = 0, shopOpenN = 0, shopOpenCost = 0;
    const shopRecent: any[] = [];
    for (const p of (partRows || [])) {
      if (!shopRoIds.has(p.ro_id)) continue;
      const cost = partCost(p);
      if (!p.date_received) { shopOpenN++; shopOpenCost += cost; }
      if (p.date_ordered === todayCT) { shopTodayN++; shopTodayCost += cost; }
      if (p.date_ordered && p.date_ordered >= mondayISO) { shopWtdN++; shopWtdCost += cost; }
      if (p.date_ordered && p.date_ordered >= sevenDaysAgoISO) shopRecent.push(p);
    }

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
      const workedList: { ro: any; tl: TlAgg }[] = [];
      for (const ro of ros) {
        const tl = tlByRo[ro.id];
        hoursToday += tl?.todayH || 0;
        hoursWTD += tl?.wtdH || 0;
        hours7d += tl?.h7d || 0;
        tl?.techsToday.forEach((t) => techsToday.add(t));
        const active = tl && tl.lastDate >= idleCutoff;
        const done = DONE_STATUSES.has(ro.status);
        if (active) { worked++; workedList.push({ ro, tl: tl! }); }
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
        hoursToday, hoursWTD, hours7d, worked, idle, idleList, workedList,
        readinessPct, checkPct, fullyReady, applicable, passing,
        readyFails, fires,
      };
    }

    // ── Build per-manager sections ──────────────────────────────────────
    const sevColor = (s: string) => s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : "#6b7280";
    const sevDot = (s: string) => `<span style="color:${sevColor(s)};">${s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🟡"}</span>`;

    const card = (label: string, value: string, color = "#1e293b") =>
      `<td style="padding:8px 4px;text-align:center;"><div style="font-size:18px;font-weight:800;color:${color};">${value}</div><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div></td>`;

    // Reusable per-manager card — identical HTML in admin-preview and the
    // per-manager send, so what an admin validates is exactly what the
    // manager receives.
    function managerCardHtml(m: any, r: ReturnType<typeof computeManager>): string {
      const isParts = m.role === "parts_manager";
      const readyColor = r.readinessPct >= 90 ? "#16a34a" : r.readinessPct >= 70 ? "#d97706" : "#dc2626";

      // List Activity scorecard
      const activity = `<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:8px 0 12px;"><tr>
        ${card("ROs on list", String(r.roCount))}
        ${card("Techs today", String(r.techsToday), r.techsToday ? "#16a34a" : "#94a3b8")}
        ${card("Hours today", r.hoursToday.toFixed(1))}
        ${card("Hours WTD", r.hoursWTD.toFixed(1))}
        ${card("Worked / Idle", `${r.worked} / ${r.idle}`, r.idle ? "#d97706" : "#16a34a")}
        ${card("P&L Ready", `${r.readinessPct}%`, readyColor)}
      </tr></table>`;

      // Active work (GOOD NEWS, leads the report) — every RO that got tech
      // time in the window, with its labor hours + a one-line progress
      // summary (status · hours · techs today · WO progress).
      const activeHtml = r.workedList.length
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin:0 0 12px;">
             <div style="font-size:12px;font-weight:800;color:#166534;margin-bottom:6px;">✅ Active work — ${r.workedList.length} RO${r.workedList.length > 1 ? "s" : ""} getting hands-on time (last ${IDLE_WORKING_DAYS} work days) · ${r.hours7d.toFixed(1)}h logged across the list in 7 days &nbsp;${guideLink("rb-active")}</div>
             ${[...r.workedList].sort((a, b) => (b.tl.h7d || 0) - (a.tl.h7d || 0)).map(({ ro, tl }) => {
               const wos = wosByRo[ro.id] || [];
               const woTotal = wos.length;
               const woDone = wos.filter((w: any) => w.completed_at).length;
               const woTechDone = wos.filter((w: any) => w.tech_done_at && !w.completed_at).length;
               const woBit = woTotal
                 ? ` · WOs ${woDone}/${woTotal} done${woTechDone ? `, ${woTechDone} awaiting your sign-off` : ""}`
                 : ` · no WO yet`;
               const techBit = tl.techsToday.size ? ` · ${tl.techsToday.size} tech${tl.techsToday.size > 1 ? "s" : ""} today` : "";
               const todayBit = tl.todayH ? ` (${tl.todayH.toFixed(1)}h today)` : "";
               return `<div style="font-size:12px;margin-bottom:5px;line-height:1.5;">🟢 ${roLink(ro.ro_id, ro.customer_name || ro.ro_id)} <span style="color:#475569;">— ${esc(ro.status || "—")} · <b>${(tl.h7d || 0).toFixed(1)}h</b> in last 7d${todayBit}${techBit}${woBit}</span></div>`;
             }).join("")}
           </div>`
        : `<div style="font-size:12px;color:#64748b;margin:0 0 12px;">No ROs on your list have had tech time in the last ${IDLE_WORKING_DAYS} work days — see what needs attention below.</div>`;

      // Idle group (the "easy vs hard" tell) — grouped box + plain footer
      const idleHtml = r.idleList.length
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:0 0 12px;">
             <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:5px;">🕒 Idle ROs (${r.idleList.length}) — no tech time in ${IDLE_WORKING_DAYS} work days &nbsp;${guideLink("rb-idle")}</div>
             ${r.idleList.slice(0, 25).map((ro) => `<div style="font-size:12px;margin-bottom:3px;line-height:1.45;">🟡 ${roLink(ro.ro_id, ro.customer_name || ro.ro_id)} <span style="color:#64748b;">— status ${esc(ro.status || "—")}</span></div>`).join("")}
           </div>`
        : `<div style="font-size:12px;color:#16a34a;margin:0 0 12px;">✅ Every RO on the list got tech time within the last ${IDLE_WORKING_DAYS} work days.</div>`;

      // Fire Watch preview (P2 will color-band + expand)
      const fireHtml = r.fires.length
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 12px;">
             <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:5px;">🔥 Fire Watch (${r.fires.length}) &nbsp;${guideLink("rb-firewatch")}</div>
             ${r.fires.slice(0, 15).map((f) => `<div style="font-size:12px;margin-bottom:5px;line-height:1.45;">${sevDot(f.sev)} ${f.html}</div>`).join("")}
           </div>`
        : `<div style="font-size:12px;color:#16a34a;margin:0 0 12px;">✅ No fires on this list today.</div>`;

      // P&L Readiness fails
      const readyHtml = r.readyFails.length
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:0 0 8px;">
             <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:5px;">📋 P&L Readiness — fix these (${r.passing}/${r.applicable} checks pass) &nbsp;${guideLink("rb-readiness")}</div>
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
          <div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:4px;">📦 Action needed — ${siloLessOpenParts.length} open part${siloLessOpenParts.length !== 1 ? "s" : ""} have NO service silo (across ${entries.length} RO${entries.length !== 1 ? "s" : ""}) &nbsp;${guideLink("rb-parts")}</div>
          <div style="font-size:11px;color:#1e3a5f;margin-bottom:7px;line-height:1.5;"><b>What this is:</b> a part with no Service Silo can't be costed to a team, so it falls into the <b>Unattributed</b> cost row and hides each silo's true margin. The number in parentheses is how many silo-less parts are on that RO.</div>
          <div style="font-size:12px;line-height:1.5;">${entries.slice(0, 20).map(([id, n]) => { const ro = roById[id]; return `${roLink(ro?.ro_id, ro?.customer_name || ro?.ro_id)} (${n})`; }).join(", ")}${entries.length > 20 ? " …" : ""}</div>
          <div style="background:#fff;border:1px solid #dbeafe;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:11px;color:#334155;line-height:1.55;">
            <b style="color:#1e40af;">How to clear them:</b><br>
            1. Click a <b>customer</b> RO above to open it, then go to the <b>Parts</b> section.<br>
            2. On each part, set the <b>Service Silo</b> to match the work it's for (Repair, Roof, Solar, Vroom, Paint &amp; Body, Chassis, Detailing, TrueTopper). Save.<br>
            3. Repeat down the list of customer ROs.<br>
            <b style="color:#92400e;">Shop / overhead parts:</b> parts on the <b>PRVS - SHOP OPERATIONS</b> RO (and any general shop stock not tied to a customer job) are overhead — leave their silo blank. There is no "overhead" silo for parts today, so they will keep showing here; reply to this email and we'll add a proper place for them so they stop cluttering this list.
          </div>
        </div>`;
      }

      return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:16px;font-weight:800;color:#1e3a5f;">👤 ${esc(m.name)} <span style="font-weight:600;color:#64748b;font-size:12px;">· ${esc(m.role)}${m.service_silo ? " · " + esc(siloName(m.service_silo)) : ""}</span></div>
        ${activity}${activeHtml}${idleHtml}${fireHtml}${readyHtml}${partsExtra}
      </div>`;
    }

    // Build each qualifying manager once: { m, r, card }.
    const rendered: { m: any; r: ReturnType<typeof computeManager>; card: string }[] = [];
    const summaryRows: string[] = [];

    for (const m of managers.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))) {
      const email = String(m.email).toLowerCase();
      const r = computeManager(email);
      const isParts = m.role === "parts_manager";

      // Skip silo/sr managers with empty lists (nothing to send) — but always
      // include parts managers (they get the lot-wide silo-less list).
      if (r.roCount === 0 && !isParts) continue;

      const readyColor = r.readinessPct >= 90 ? "#16a34a" : r.readinessPct >= 70 ? "#d97706" : "#dc2626";
      summaryRows.push(`<tr>
        <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;"><b>${esc(m.name)}</b> <span style="color:#94a3b8;">${esc(m.role)}</span></td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;">${r.roCount}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;">${r.hours7d.toFixed(1)}h</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${r.idle ? "#d97706" : "#16a34a"};font-weight:700;">${r.idle}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${readyColor};font-weight:800;">${r.readinessPct}%</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;color:${r.fires.length ? "#dc2626" : "#16a34a"};font-weight:700;">${r.fires.length}</td>
      </tr>`);

      rendered.push({ m, r, card: managerCardHtml(m, r) });
    }
    const managersWithList = rendered.length;
    const sections = rendered.map((x) => x.card).join("");

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
      <div style="font-size:13px;font-weight:800;color:#1e3a5f;margin-bottom:6px;">📖 How to read this report</div>
      <div style="font-size:12px;color:#334155;line-height:1.55;">
        <b>✅ Active work</b> — the ROs on your list getting hands-on tech time, with hours logged and a quick progress read (status, work-order progress, who's on it today). Start here — this is what's moving.<br>
        <b>🕒 Idle ROs</b> — on your work list but no tech time in ${IDLE_WORKING_DAYS} work days. Get an RO off the list by: (1) making sure a tech clocks in; (2) if it is a placeholder, opening the RO and using the <b>Schedule</b> button to put it on the calendar; (3) if it is waiting on parts or an approval, setting the status correctly (Awaiting parts / Awaiting Approval); or (4) removing it from the list if it is not yours right now.<br>
        <b>🔥 Fire Watch</b> — a promised date has passed or a part is late. <b style="color:#dc2626;">🔴 = handle today</b>, <b style="color:#d97706;">🟠 = handle this week</b>. The <b>↳</b> note under each line is the exact fix.<br>
        <b>📋 P&L Readiness</b> — The RO(s) Work Order estimated value data that is used to calculate P&L has not been set yet. The <b>↳</b> note under each line says exactly where to click. A higher % means the team's numbers can be trusted.
      </div>
    </div>`;

    // Shared footer (both modes).
    const footerHtml = `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#888;font-size:11px;">Guards active: invalid dates (year &lt; 2020) flagged not fired; soft-deleted + training ROs excluded. Idle = no labor in ${IDLE_WORKING_DAYS} working days. Done-Done window ${DONE_DONE_BUSINESS_DAYS} business days. P&L Readiness checks: R1 has WO · R2 WO valued · R3 WO silo · R5 tech rate · R7 part silo · R8 part has WO · R9 Done-Done.<br>
    ${FN_VERSION} · generated automatically by the PRVS Dashboard. Spec: docs/specs/MANAGER_DAILY_REPORT_SPEC.md</p>
  </div>`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const fromName = `"Patriots RV Services" <${gmailUser}>`;
    const replyTo = "Patriots RV Services <info@patriotsrvservices.com>";

    // Shop parts spend box — ADMIN email only (overhead abuse-watch).
    const shopBox = shopRoIds.size ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
      <div style="font-size:14px;font-weight:800;color:#9a3412;">🛒 Shop parts spend <span style="font-weight:600;font-size:11px;color:#c2410c;">· overhead · admins only</span></div>
      <div style="font-size:11px;color:#7c2d12;margin:2px 0 6px;">Daily watch on what's being ordered against the PRVS - SHOP OPERATIONS RO${shopRoIds.size > 1 ? "s" : ""}. Not shown to managers.</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #fed7aa;border-radius:10px;margin:4px 0 8px;"><tr>
        ${card("Ordered today", usd(shopTodayCost))}
        ${card("Parts today", String(shopTodayN))}
        ${card("Ordered this week", usd(shopWtdCost))}
        ${card("Parts this week", String(shopWtdN))}
        ${card("Open shop parts $", usd(shopOpenCost), "#9a3412")}
        ${card("Open count", String(shopOpenN))}
      </tr></table>
      ${shopRecent.length
        ? `<div style="font-size:11px;color:#334155;line-height:1.6;"><b style="color:#9a3412;">Ordered in the last 7 days:</b><br>${[...shopRecent].sort((a, b) => String(b.date_ordered).localeCompare(String(a.date_ordered))).slice(0, 20).map((p) => `• ${esc(p.part_name || "part")} ×${num(p.qty) || 1} — <b>${usd(partCost(p))}</b> <span style="color:#94a3b8;">(${esc(p.date_ordered)})</span>`).join("<br>")}</div>`
        : `<div style="font-size:11px;color:#64748b;">No shop parts ordered in the last 7 days.</div>`}
      <div style="font-size:10px;color:#9ca3af;margin-top:6px;">$ = wholesale × qty + freight. Parts with no price entered count as $0.</div>
    </div>` : "";

    // Admin combined email — every manager's card + the shop-spend box. Sent
    // to admins in BOTH modes: a preview when send=false; admins' own copy
    // when send=true (managers get their individual cards separately).
    const adminBanner = wantSend
      ? `<div style="background:#064e3b;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
           <div style="color:#6ee7b7;font-size:13px;font-weight:800;">🧭 Manager Daily Report — admin copy</div>
           <div style="color:#d1fae5;font-size:12px;margin-top:4px;line-height:1.5;">Each manager was emailed their own report this morning. This is your combined copy — every manager's card plus the shop-parts-spend box (admins only). GUIDE-not-JUDGE: no scoring or ranking.</div>
         </div>`
      : previewBanner;
    const adminTitle = wantSend ? "🧭 Manager Daily Report — Admin Copy" : "🧭 Manager Daily Report — Preview";
    const adminHtmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:18px;">
    <h1 style="color:#1e3a5f;margin:0;font-size:20px;">${adminTitle}</h1>
    <p style="margin:4px 0 0;color:#555;font-size:13px;">Patriots RV Services · ${dateStr} · Week of ${mondayISO} · ${FN_VERSION}</p>
  </div>
  ${adminBanner}
  ${legend}
  <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 6px;">Summary — ${managersWithList} manager${managersWithList !== 1 ? "s" : ""}</h2>
  ${summaryTable}
  ${shopBox}
  ${sections || `<p style="font-size:13px;color:#64748b;">No managers with active work lists.</p>`}
  ${footerHtml}
</body></html>`;
    const adminSubject = wantSend
      ? `🧭 Manager Report (admin copy) — ${dateStr} — ${managersWithList} managers emailed`
      : `🧭 Manager Report PREVIEW (P1) — ${dateStr} — ${managersWithList} managers`;

    // ════════════════════════════════════════════════════════════════════
    // P4 — PER-MANAGER SEND (gated). Each manager gets ONLY their own card
    // (no cross-manager summary/ranking — GUIDE not JUDGE). Admins are NOT
    // CC'd on each one; they get the single combined admin copy below (all
    // cards + shop spend), so their inbox stays clean.
    // ════════════════════════════════════════════════════════════════════
    if (wantSend) {
      const sentTo: string[] = [];
      const failed: { email: string; error: string }[] = [];

      for (const x of rendered) {
        const to = String(x.m.email);
        const managerHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:18px;">
    <h1 style="color:#1e3a5f;margin:0;font-size:20px;">🧭 Your Daily Manager Report</h1>
    <p style="margin:4px 0 0;color:#555;font-size:13px;">Patriots RV Services · ${dateStr} · Week of ${mondayISO}</p>
  </div>
  <p style="font-size:13px;color:#334155;margin:0 0 14px;">Good morning, ${esc(x.m.name)} — here's where your work list stands this morning, in priority order. Each flag links straight to the RO, and the <b>↳</b> note under it is the exact fix.</p>
  ${legend}
  ${x.card}
  ${footerHtml}
</body></html>`;
        try {
          await transporter.sendMail({
            from: fromName, replyTo,
            to,
            subject: `🧭 Your Daily Manager Report — ${dateStr}`,
            text: `Your Daily Manager Report — ${dateStr}\nWeek of ${mondayISO}. Open the HTML version for the detail. Dashboard: ${DASH_URL}`,
            html: managerHtml,
          });
          sentTo.push(to);
        } catch (e) {
          failed.push({ email: to, error: String(e) });
        }
      }

      // Admins' combined copy (with the shop-spend box).
      let adminSent = false; let adminError: string | null = null;
      try {
        await transporter.sendMail({
          from: fromName, replyTo,
          to: recipients, subject: adminSubject,
          text: `Manager Daily Report — ${dateStr}. ${sentTo.length} managers emailed their own report. This is the combined admin copy (all cards + shop spend).`,
          html: adminHtmlBody,
        });
        adminSent = true;
      } catch (e) { adminError = String(e); }

      const summary = {
        success: failed.length === 0 && adminSent, version: FN_VERSION, mode: "per-manager-send",
        managersSent: sentTo.length, sentTo, failed,
        adminCopyTo: recipients, adminSent, adminError,
      };
      console.log("send-manager-report (P4 per-manager send):", JSON.stringify(summary));
      return new Response(JSON.stringify(summary), {
        status: failed.length === 0 && adminSent ? 200 : 207,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Default / cron path (send=false): combined ADMIN-PREVIEW to admins ──
    await transporter.sendMail({
      from: fromName, replyTo,
      to: recipients, subject: adminSubject,
      text: `Manager Daily Report PREVIEW — ${dateStr}\n${managersWithList} managers with active lists. Admin-preview only; no manager emails sent.\nSee the HTML version for the rule-engine detail.`,
      html: adminHtmlBody,
    });

    const summary = {
      success: true, version: FN_VERSION, mode: "admin-preview",
      recipients, managersRendered: managersWithList,
    };
    console.log("send-manager-report (admin preview) sent:", JSON.stringify(summary));
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
