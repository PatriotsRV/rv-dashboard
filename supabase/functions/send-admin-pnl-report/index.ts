import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// ============================================================
// send-admin-pnl-report — Daily Ops Health email (ADMIN ONLY)
// Session 101 (2026-06-11) — v1, rule-based (no AI commentary yet).
//
// Called by pg_cron at 6:00 AM CT weekdays. Recipients come from
// app_config key 'admin_report_recipients' (comma-separated),
// falling back to roland@patriotsrvservices.com.
//
// Sections:
//   1. Exception flags  — margin/red-flag lines, lead of the email
//   2. WTD scorecard    — revenue / WIP / labor / parts / GP
//   3. Silo health      — per-silo WTD numbers + data-completeness %
//   4. Manager blocks   — each manager's work list w/ WTD cost vs WO value
//   5. WIP aging        — WOs tech-done >3 days awaiting manager Done-Done
//   6. Coaching         — rule-based "where the missing number gets set"
//
// Data: weekly_pnl + weekly_pnl_detail RPCs (canonical attribution),
// manager_work_lists, service_work_orders, repair_orders, staff.
// Thresholds (v1 defaults, tune later): labor/revenue amber >40% red >55%;
// WIP aging >3d; completeness flag <90%.
// ============================================================

const ALLOWED_ORIGIN = "https://patriotsrv.github.io";
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SILO_META: Record<string, { label: string; emoji: string }> = {
  repair:       { label: "Repair",       emoji: "🔧" },
  vroom:        { label: "Vroom",        emoji: "✨" },
  solar:        { label: "Solar",        emoji: "☀️" },
  roof:         { label: "Roof",         emoji: "🏠" },
  paint_body:   { label: "Paint & Body", emoji: "🎨" },
  chassis:      { label: "Chassis",      emoji: "🔩" },
  detailing:    { label: "Detailing",    emoji: "🧽" },
  truetopper:   { label: "TrueTopper",   emoji: "🏕️" },
  overhead:     { label: "Overhead",     emoji: "🛠️" },
  unattributed: { label: "Unattributed", emoji: "❓" },
};
const siloName = (k: string) =>
  SILO_META[k] ? `${SILO_META[k].emoji} ${SILO_META[k].label}` : (k || "—");

// Thresholds — v1 defaults
const LABOR_AMBER = 0.40;
const LABOR_RED = 0.55;
const WIP_AGE_DAYS = 3;
const COMPLETENESS_FLAG = 90; // %

const num = (v: unknown) => Number(v) || 0;
const usd = (v: unknown) =>
  "$" + num(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Monday (YYYY-MM-DD) of the current week in America/Chicago.
function chicagoMondayISO(weeksBack = 0): string {
  const nowCT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
  );
  nowCT.setHours(0, 0, 0, 0);
  nowCT.setDate(nowCT.getDate() - ((nowCT.getDay() + 6) % 7) - 7 * weeksBack);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${nowCT.getFullYear()}-${p(nowCT.getMonth() + 1)}-${p(nowCT.getDate())}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const nowCT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const isMonday = nowCT.getDay() === 1;
    const dateStr = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const weekISO = chicagoMondayISO(0);
    const prevWeekISO = chicagoMondayISO(1);

    // ── Recipients (app_config, fallback Roland) ────────────────────
    let recipients = "roland@patriotsrvservices.com";
    const { data: cfg } = await sb.from("app_config")
      .select("value").eq("key", "admin_report_recipients").maybeSingle();
    if (cfg?.value) recipients = cfg.value;

    // ── 1. Weekly P&L — current week (+ last week on Mondays) ───────
    const { data: pnlRows, error: ePnl } = await sb.rpc("weekly_pnl", {
      p_start: isMonday ? prevWeekISO : weekISO, p_end: weekISO,
    });
    if (ePnl) throw ePnl;
    const wk = (pnlRows || []).filter((r: any) => r.week_start === weekISO);
    const prevWk = (pnlRows || []).filter((r: any) => r.week_start === prevWeekISO);

    const sumF = (rows: any[], f: string) => rows.reduce((s, r) => s + num(r[f]), 0);
    const revOf = (rows: any[]) => sumF(rows, "revenue_completed") + sumF(rows, "revenue_fallback");

    // ── 2. Per-silo RO detail (canonical attribution) ───────────────
    // roMap: ro_code -> aggregated WTD numbers across silos.
    type RoAgg = {
      ro_code: string; customer: string; rv: string; hours: number; labor: number;
      parts: number; wo_value: number | null; wo_status: string | null;
      completed_at: string | null; tech_done_at: string | null; silos: string[];
    };
    const roMap: Record<string, RoAgg> = {};
    const detailBySilo: Record<string, any[]> = {};
    const siloKeys = [...new Set(wk.map((r: any) => r.service_silo))];
    for (const silo of siloKeys) {
      const { data: det, error: eDet } = await sb.rpc("weekly_pnl_detail", {
        p_week: weekISO, p_silo: silo,
      });
      if (eDet) { console.error("detail error", silo, eDet); continue; }
      detailBySilo[silo] = det || [];
      if (silo === "unattributed") continue; // context rows — already counted in real silos
      for (const r of det || []) {
        const code = r.ro_code || "?";
        const a = roMap[code] ??= {
          ro_code: code, customer: r.customer_name || "", rv: r.rv || "",
          hours: 0, labor: 0, parts: 0, wo_value: null, wo_status: null,
          completed_at: null, tech_done_at: null, silos: [],
        };
        a.hours += num(r.hours);
        a.labor += num(r.labor_cost);
        a.parts += num(r.parts_cost_cum);
        if (r.wo_value != null && (a.wo_value == null || Number(r.wo_value) > a.wo_value)) {
          a.wo_value = Number(r.wo_value); a.wo_status = r.wo_status || null;
        }
        if (r.completed_at) a.completed_at = r.completed_at;
        if (r.tech_done_at) a.tech_done_at = r.tech_done_at;
        if (!a.silos.includes(silo)) a.silos.push(silo);
      }
    }

    // ── 3. Manager work lists ────────────────────────────────────────
    const { data: wlRows, error: eWl } = await sb.from("manager_work_lists")
      .select("manager_email, ro_id, ro_name, service_silo, priority")
      .order("priority", { ascending: true });
    if (eWl) console.error("manager_work_lists error:", eWl);
    const { data: staffRows } = await sb.from("staff").select("email, name");
    const staffName: Record<string, string> = {};
    for (const s of staffRows || []) {
      if (s.email) staffName[String(s.email).toLowerCase()] = s.name || s.email;
    }
    // Active RO facts for work-list entries (status + RO-level dollar_value).
    const wlCodes = [...new Set((wlRows || []).map((w: any) => w.ro_id).filter(Boolean))];
    const roFacts: Record<string, any> = {};
    if (wlCodes.length) {
      const { data: ros } = await sb.from("repair_orders")
        .select("ro_id, customer_name, status, dollar_value, deleted_at")
        .in("ro_id", wlCodes);
      for (const r of ros || []) if (!r.deleted_at) roFacts[r.ro_id] = r;
    }
    const byManager: Record<string, any[]> = {};
    for (const w of wlRows || []) {
      const em = String(w.manager_email || "").toLowerCase();
      if (!em || !roFacts[w.ro_id]) continue; // skip deleted/unknown ROs
      (byManager[em] ??= []).push(w);
    }

    // ── 4. WIP aging — tech-done WOs awaiting manager Done-Done ─────
    const cutoff = new Date(Date.now() - WIP_AGE_DAYS * 86400000).toISOString();
    const { data: agingRaw } = await sb.from("service_work_orders")
      .select("dollar_value, service_silo, status, tech_done_at, repair_orders!inner(ro_id, customer_name, deleted_at)")
      .is("completed_at", null).not("tech_done_at", "is", null)
      .lt("tech_done_at", cutoff);
    const aging = (agingRaw || [])
      .filter((w: any) => !w.repair_orders?.deleted_at)
      .map((w: any) => ({
        ro: w.repair_orders?.ro_id || "?", customer: w.repair_orders?.customer_name || "",
        silo: w.service_silo || "", value: num(w.dollar_value),
        days: Math.floor((Date.now() - new Date(w.tech_done_at).getTime()) / 86400000),
      }))
      .sort((a, b) => b.days - a.days);
    const agingTotal = aging.reduce((s, w) => s + w.value, 0);

    // ── 5. Rule-based analysis ───────────────────────────────────────
    const flags: string[] = [];      // exceptions (lead section)
    const coaching: string[] = [];   // fix-it guidance per silo

    const unattrib = wk.find((r: any) => r.service_silo === "unattributed");
    const unattribParts = num(unattrib?.parts_cost_cum);
    if (unattribParts > 0) {
      flags.push(`❓ <b>${usd(unattribParts)} of parts are untagged</b> (no service silo) — invisible to every team's cost. Parts manager: assign silos.`);
      coaching.push(`<b>Untagged parts (${usd(unattribParts)}):</b> each part needs its service silo set when entered. Fix existing ones from the RO → Parts form.`);
    }

    const siloStats = wk
      .filter((r: any) => !["overhead", "unattributed"].includes(r.service_silo))
      .map((r: any) => {
        const k = r.service_silo;
        const rev = num(r.revenue_completed) + num(r.revenue_fallback);
        const wip = num(r.revenue_wip);
        const labor = num(r.labor_cost);
        const hours = num(r.hours);
        const det = (detailBySilo[k] || []);
        const withWO = det.filter((d: any) => d.wo_value != null).length;
        const completeness = det.length ? Math.round(withWO / det.length * 100) : 100;
        const base = rev + wip;
        const ratio = base > 0 ? labor / base : null;
        return { k, rev, wip, labor, hours, parts: num(r.parts_cost_cum), roCount: num(r.ro_count), completeness, ratio };
      });

    for (const s of siloStats) {
      if (s.hours > 2 && s.rev === 0 && s.wip === 0) {
        flags.push(`🚫 <b>${siloName(s.k)}: ${s.hours.toFixed(1)}h of labor (${usd(s.labor)}) with ZERO revenue attached</b> — work orders missing or unpriced. This team's effort is invisible.`);
        coaching.push(`<b>${siloName(s.k)}:</b> every active RO needs a Work Order with a Dollar Value and the right silo. Revenue counts only when the manager marks it Done-Done.`);
      } else if (s.ratio != null && s.ratio > LABOR_RED) {
        flags.push(`🔴 <b>${siloName(s.k)}: labor is ${(s.ratio * 100).toFixed(0)}% of revenue base</b> (${usd(s.labor)} vs ${usd(s.rev + s.wip)} completed+WIP) — margin loss territory.`);
      } else if (s.ratio != null && s.ratio > LABOR_AMBER) {
        flags.push(`🟠 ${siloName(s.k)}: labor at ${(s.ratio * 100).toFixed(0)}% of revenue base — watch it (healthy is under ${(LABOR_AMBER * 100).toFixed(0)}%).`);
      }
      if (s.completeness < COMPLETENESS_FLAG && s.roCount > 0) {
        coaching.push(`<b>${siloName(s.k)} data completeness ${s.completeness}%:</b> ${100 - s.completeness}% of this week's ROs have no priced WO — margins for this silo are NOT trustworthy yet.`);
      }
    }
    if (aging.length) {
      flags.push(`⏳ <b>${usd(agingTotal)} sitting in WIP limbo</b> — ${aging.length} work order${aging.length > 1 ? "s" : ""} tech-done for over ${WIP_AGE_DAYS} days awaiting manager Done-Done. That is earned revenue not yet recognized.`);
      coaching.push(`<b>WIP limbo:</b> managers must review tech-done WOs daily and mark Done-Done — it is the revenue-recognition step.`);
    }

    // ── 6. Build HTML ────────────────────────────────────────────────
    const thS = `padding:6px 10px;text-align:right;font-size:11px;font-weight:700;color:#555;border-bottom:1px solid #e5e7eb;background:#f9fafb;`;
    const thL = thS + "text-align:left;";
    const tdS = `padding:6px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;`;
    const tdL = tdS + "text-align:left;";

    const revAll = revOf(wk), wipAll = sumF(wk, "revenue_wip"),
      laborAll = sumF(wk, "labor_cost"), partsAll = sumF(wk, "parts_cost_matched");
    const gp = revAll - laborAll - partsAll;
    const card = (label: string, value: string, color = "#1e293b") =>
      `<td style="padding:10px 6px;text-align:center;"><div style="font-size:20px;font-weight:800;color:${color};">${value}</div><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">${label}</div></td>`;
    const scorecard = `<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:18px;"><tr>
      ${card("Revenue (WTD)", usd(revAll), "#16a34a")}${card("WIP", usd(wipAll), "#d97706")}
      ${card("Labor", usd(laborAll))}${card("Parts", usd(partsAll))}
      ${card("Gross profit", usd(gp), gp >= 0 ? "#16a34a" : "#dc2626")}</tr></table>`;

    const flagsHtml = flags.length
      ? `<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
           <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px;">⚠️ NEEDS YOUR ATTENTION (${flags.length})</div>
           ${flags.map(f => `<div style="font-size:13px;color:#1f2937;margin-bottom:6px;line-height:1.45;">${f}</div>`).join("")}
         </div>`
      : `<div style="background:#f0fdf4;border:1px solid #22c55e;border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#166534;font-weight:700;">✅ No exception flags this morning.</div>`;

    const siloTable = `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <thead><tr><th style="${thL}">Silo</th><th style="${thS}">ROs</th><th style="${thS}">Hours</th><th style="${thS}">Labor</th><th style="${thS}">Parts</th><th style="${thS}">Completed</th><th style="${thS}">WIP</th><th style="${thS}">Labor %</th><th style="${thS}">Data ✓</th></tr></thead><tbody>
      ${siloStats.map(s => {
        const rc = s.ratio == null ? "#9ca3af" : s.ratio > LABOR_RED ? "#dc2626" : s.ratio > LABOR_AMBER ? "#d97706" : "#16a34a";
        const cc = s.completeness < COMPLETENESS_FLAG ? "#dc2626" : "#16a34a";
        return `<tr><td style="${tdL}font-weight:700;">${siloName(s.k)}</td><td style="${tdS}">${s.roCount}</td><td style="${tdS}">${s.hours.toFixed(1)}</td><td style="${tdS}">${usd(s.labor)}</td><td style="${tdS}">${usd(s.parts)}</td><td style="${tdS}">${usd(s.rev)}</td><td style="${tdS}">${usd(s.wip)}</td><td style="${tdS}color:${rc};font-weight:800;">${s.ratio == null ? "—" : (s.ratio * 100).toFixed(0) + "%"}</td><td style="${tdS}color:${cc};font-weight:800;">${s.completeness}%</td></tr>`;
      }).join("")}</tbody></table>`;

    const managerBlocks = Object.keys(byManager).sort().map(em => {
      const name = staffName[em] || em;
      const items = byManager[em];
      let pipeline = 0;
      const rows = items.map((w: any) => {
        const fact = roFacts[w.ro_id] || {};
        const agg = roMap[w.ro_id];
        const woVal = agg?.wo_value ?? (fact.dollar_value != null ? Number(fact.dollar_value) : null);
        const cost = (agg?.labor || 0) + (agg?.parts || 0);
        if (woVal != null && !agg?.completed_at) pipeline += woVal;
        const ratio = woVal && cost > 0 ? cost / woVal * 100 : null;
        const rc = ratio == null ? "#9ca3af" : ratio > 100 ? "#dc2626" : ratio > 55 ? "#d97706" : "#16a34a";
        const miss = [];
        if (woVal == null) miss.push("no priced WO");
        if (agg && agg.hours === 0) miss.push("no hours this wk");
        const missTxt = miss.length ? `<div style="font-size:10px;color:#b45309;font-weight:700;">⚠ ${miss.join(" · ")}</div>` : "";
        return `<tr><td style="${tdL}"><b>${esc(w.ro_id)}</b><br><span style="color:#64748b;">${esc(fact.customer_name || w.ro_name || "")}</span>${missTxt}</td>
          <td style="${tdL}">${esc(siloName(w.service_silo || ""))}</td>
          <td style="${tdS}">${agg ? agg.hours.toFixed(1) : "0.0"}</td>
          <td style="${tdS}">${usd(agg?.labor)}</td><td style="${tdS}">${usd(agg?.parts)}</td>
          <td style="${tdS}">${woVal != null ? usd(woVal) : "—"}</td>
          <td style="${tdS}color:${rc};font-weight:800;">${ratio != null ? ratio.toFixed(0) + "%" : "—"}</td>
          <td style="${tdL}font-size:11px;color:#64748b;">${esc(fact.status || "")}</td></tr>`;
      }).join("");
      return `<div style="margin-bottom:16px;">
        <div style="font-size:14px;font-weight:800;color:#1e3a5f;margin-bottom:4px;">👤 ${esc(name)} <span style="font-weight:600;color:#64748b;font-size:12px;">· ${items.length} RO${items.length !== 1 ? "s" : ""} on list · pipeline ${usd(pipeline)}</span></div>
        <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="${thL}">RO</th><th style="${thL}">Silo</th><th style="${thS}">Hrs WTD</th><th style="${thS}">Labor</th><th style="${thS}">Parts</th><th style="${thS}">WO value</th><th style="${thS}">Cost÷WO</th><th style="${thL}">Status</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join("");

    const agingHtml = aging.length ? `
      <h2 style="color:#d97706;font-size:15px;margin:18px 0 6px;">⏳ WIP limbo — tech-done &gt;${WIP_AGE_DAYS} days, not Done-Done (${usd(agingTotal)})</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;"><thead><tr><th style="${thL}">RO</th><th style="${thL}">Customer</th><th style="${thL}">Silo</th><th style="${thS}">WO value</th><th style="${thS}">Days waiting</th></tr></thead><tbody>
      ${aging.slice(0, 15).map(w => `<tr><td style="${tdL}font-weight:700;">${esc(w.ro)}</td><td style="${tdL}">${esc(w.customer)}</td><td style="${tdL}">${esc(siloName(w.silo))}</td><td style="${tdS}">${usd(w.value)}</td><td style="${tdS}font-weight:800;color:${w.days > 7 ? "#dc2626" : "#d97706"};">${w.days}</td></tr>`).join("")}
      </tbody></table>` : "";

    const coachingHtml = coaching.length ? `
      <h2 style="color:#1e3a5f;font-size:15px;margin:18px 0 6px;">🎓 Coaching — fix the data, then trust the numbers</h2>
      <ul style="font-size:13px;color:#334155;line-height:1.6;padding-left:20px;margin:0 0 14px;">${coaching.map(c => `<li style="margin-bottom:5px;">${c}</li>`).join("")}</ul>` : "";

    const lastWeekHtml = (isMonday && prevWk.length) ? (() => {
      const r = revOf(prevWk), l = sumF(prevWk, "labor_cost"), p = sumF(prevWk, "parts_cost_matched");
      const g = r - l - p;
      return `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 16px;margin-bottom:18px;font-size:13px;color:#3730a3;">
        📅 <b>Last week closed:</b> revenue ${usd(r)} · labor ${usd(l)} · parts ${usd(p)} · GP <b style="color:${g >= 0 ? "#16a34a" : "#dc2626"};">${usd(g)}</b></div>`;
    })() : "";

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:18px;">
    <h1 style="color:#1e3a5f;margin:0;font-size:20px;">📊 Daily Ops Health — Admin</h1>
    <p style="margin:4px 0 0;color:#555;font-size:13px;">Patriots RV Services · ${dateStr} · Week of ${weekISO}</p>
  </div>
  ${flagsHtml}
  ${lastWeekHtml}
  ${scorecard}
  <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 6px;">🏢 Silo health (week to date)</h2>
  ${siloTable}
  <h2 style="color:#1e3a5f;font-size:15px;margin:18px 0 8px;">📋 Manager work lists</h2>
  ${managerBlocks || `<p style="font-size:13px;color:#64748b;">No manager work-list entries.</p>`}
  ${agingHtml}
  ${coachingHtml}
  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#888;font-size:11px;">ADMIN-ONLY report · thresholds v1: labor amber &gt;${LABOR_AMBER * 100}% / red &gt;${LABOR_RED * 100}% of revenue base; WIP aging &gt;${WIP_AGE_DAYS}d; data flag &lt;${COMPLETENESS_FLAG}%.<br>
    Full detail: Weekly P&amp;L on the Work List Report. Generated automatically by the PRVS Dashboard.</p>
  </div>
</body></html>`;

    // ── 7. Send ─────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const subject = `📊 Daily Ops Health — ${dateStr}${flags.length ? ` — ${flags.length} flag${flags.length > 1 ? "s" : ""}` : " — all clear"}`;
    await transporter.sendMail({
      from: `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to: recipients, subject,
      text: `Daily Ops Health — ${dateStr}\nFlags: ${flags.length}\nRevenue WTD ${usd(revAll)} · WIP ${usd(wipAll)} · Labor ${usd(laborAll)} · Parts ${usd(partsAll)} · GP ${usd(gp)}\n\nSee HTML version for detail.`,
      html: htmlBody,
    });

    const summary = { success: true, recipients, flags: flags.length, managers: Object.keys(byManager).length, wipAging: aging.length };
    console.log("admin-pnl-report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-admin-pnl-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
