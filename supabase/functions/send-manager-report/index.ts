import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#23: Morning Manager Report — per-silo daily email
// Called by Supabase pg_cron at 8 AM CDT (13:00 UTC) Mon-Fri
// Each manager receives a personalized report for their silo(s) only.
// Sr. Managers receive one email per silo (all 5 service silos).
// v1.1 — 60-day overdue threshold, RO Name display
// v1.2 — data quality warning banner when all dollar values are $0
// v1.3 — stale/empty Work List warning banners
// v1.3b — fix data quality banner (simple flag approach)

const ALLOWED_ORIGIN = 'https://patriotsrv.github.io';
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// ── Silo display names ──────────────────────────────────────────────────
const SILO_LABELS: Record<string, string> = {
  repair: "RV Service/Repairs",
  vroom: "Vroom",
  solar: "Solar",
  roof: "Roofing",
  paint_body: "Paint & Body",
  parts_insurance: "Parts & Insurance",
};

// All service silos (those that appear in service_work_orders)
const SERVICE_SILOS = ["repair", "vroom", "solar", "roof", "paint_body"];

// ── Urgency sort weight (higher = more urgent) ─────────────────────────
const URGENCY_WEIGHT: Record<string, number> = {
  Critical: 100, High: 70, Medium: 40, Low: 10,
};

// ── RO type sort weight (higher = higher priority) ─────────────────────
const RO_TYPE_WEIGHT: Record<string, number> = {
  warranty: 40, insurance: 30, standard: 20, hybrid: 10,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser   = Deno.env.get("GMAIL_USER");
    const gmailPass   = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const todayDate = now.toISOString().split("T")[0];

    // ── 1. Get all managers with emails ─────────────────────────────────
    const { data: staffRows, error: staffErr } = await sb
      .from("staff")
      .select("name, email, role, service_silo, active")
      .in("role", ["sr_manager", "manager", "parts_manager"])
      .eq("active", true);
    if (staffErr) console.error("Error fetching staff:", staffErr);

    if (!staffRows?.length) {
      return new Response(JSON.stringify({ error: "No active managers found in staff table" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── 2. Get all active repair orders ─────────────────────────────────
    const { data: allROs, error: roErr } = await sb
      .from("repair_orders")
      .select("id, ro_id, customer_name, rv, dollar_value, urgency, ro_type, status, date_received, date_arrived, technician, has_open_parts_request, parts_status");
    if (roErr) console.error("Error fetching ROs:", roErr);

    // Build RO lookup by UUID and by text ro_id (e.g. PRVS-XXXX)
    const roMap: Record<string, any> = {};
    for (const ro of (allROs || [])) {
      roMap[ro.id] = ro;       // UUID key (for WO joins)
      if (ro.ro_id) roMap[ro.ro_id] = ro; // text key (for work list joins)
    }

    // ── 3. Get all service work orders (non-completed) ──────────────────
    const { data: allWOs, error: woErr } = await sb
      .from("service_work_orders")
      .select("id, ro_id, service_silo, status, dollar_value")
      .neq("status", "completed");
    if (woErr) console.error("Error fetching work orders:", woErr);

    // Group WOs by silo → array of ro_id UUIDs
    const wosBySilo: Record<string, any[]> = {};
    for (const wo of (allWOs || [])) {
      if (!wosBySilo[wo.service_silo]) wosBySilo[wo.service_silo] = [];
      wosBySilo[wo.service_silo].push(wo);
    }

    // ── 4. Get all manager work list entries ────────────────────────────
    const { data: allWorkLists, error: wlErr } = await sb
      .from("manager_work_lists")
      .select("id, manager_email, ro_id, ro_name, priority, service_silo, created_at")
      .order("priority", { ascending: true });
    if (wlErr) console.error("Error fetching work lists:", wlErr);

    // Group by manager_email
    const workListByManager: Record<string, any[]> = {};
    for (const wl of (allWorkLists || [])) {
      if (!workListByManager[wl.manager_email]) workListByManager[wl.manager_email] = [];
      workListByManager[wl.manager_email].push(wl);
    }

    // ── 5. Get parts that are blocking work (ordered/in transit/backordered/sourcing) ──
    const { data: blockingParts, error: partsErr } = await sb
      .from("parts")
      .select("id, ro_id, part_name, status, eta")
      .in("status", ["Ordered", "In Transit", "Backordered", "Sourcing"]);
    if (partsErr) console.error("Error fetching blocking parts:", partsErr);

    // Group blocking parts by RO UUID
    const blockingPartsByRO: Record<string, any[]> = {};
    for (const p of (blockingParts || [])) {
      if (!blockingPartsByRO[p.ro_id]) blockingPartsByRO[p.ro_id] = [];
      blockingPartsByRO[p.ro_id].push(p);
    }

    // ── 6. Get assigned techs from service_tasks ────────────────────────
    const { data: allTasks, error: taskErr } = await sb
      .from("service_tasks")
      .select("ro_id, work_order_id, assigned_tech_email, status")
      .neq("status", "completed");
    if (taskErr) console.error("Error fetching tasks:", taskErr);

    // Map WO id → assigned tech emails (deduplicated)
    const techsByWO: Record<string, Set<string>> = {};
    for (const t of (allTasks || [])) {
      if (t.assigned_tech_email) {
        if (!techsByWO[t.work_order_id]) techsByWO[t.work_order_id] = new Set();
        techsByWO[t.work_order_id].add(t.assigned_tech_email);
      }
    }

    // Get tech name lookup from staff
    const { data: allStaff } = await sb
      .from("staff")
      .select("name, email")
      .eq("active", true);
    const techNameMap: Record<string, string> = {};
    for (const s of (allStaff || [])) {
      techNameMap[s.email] = s.name;
    }

    // ── Helper: calculate days on lot ───────────────────────────────────
    function daysOnLot(ro: any): number {
      const ref = ro.date_arrived || ro.date_received;
      if (!ref) return 0;
      const d = new Date(ref);
      return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
    }

    // ── Helper: sort ROs by priority spec ───────────────────────────────
    function sortROs(ros: any[]): any[] {
      return ros.sort((a, b) => {
        // 1. Days on lot descending
        const dA = daysOnLot(a), dB = daysOnLot(b);
        if (dB !== dA) return dB - dA;
        // 2. Urgency descending
        const uA = URGENCY_WEIGHT[a.urgency] || 0, uB = URGENCY_WEIGHT[b.urgency] || 0;
        if (uB !== uA) return uB - uA;
        // 3. RO type: warranty > insurance > standard > hybrid
        const tA = RO_TYPE_WEIGHT[a.ro_type] || 0, tB = RO_TYPE_WEIGHT[b.ro_type] || 0;
        return tB - tA;
      });
    }

    // ── Helper: urgency badge color ─────────────────────────────────────
    function urgencyBadge(u: string): string {
      const colors: Record<string, string> = {
        Critical: "background:#fee2e2;color:#991b1b",
        High: "background:#fff7ed;color:#9a3412",
        Medium: "background:#fef3c7;color:#92400e",
        Low: "background:#f0fdf4;color:#15803d",
      };
      const style = colors[u] || "background:#f3f4f6;color:#6b7280";
      return `<span style="${style};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600">${u || "—"}</span>`;
    }

    // ── Helper: RO type badge ───────────────────────────────────────────
    function roTypeBadge(t: string): string {
      const colors: Record<string, string> = {
        warranty: "background:#dbeafe;color:#1e40af",
        insurance: "background:#e0e7ff;color:#3730a3",
        standard: "background:#f3f4f6;color:#374151",
        hybrid: "background:#fce7f3;color:#9d174d",
      };
      const style = colors[t] || "background:#f3f4f6;color:#6b7280";
      const label = t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
      return `<span style="${style};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600">${label}</span>`;
    }

    // ── Helper: format currency ─────────────────────────────────────────
    function fmtDollars(val: number | null | undefined): string {
      if (val == null || val === 0) return "$0.00";
      return "$" + Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ── Shared minified styles ──────────────────────────────────────────
    const th = `padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#555;border-bottom:1px solid #e5e7eb;background:#f9fafb`;
    const td = `padding:7px 10px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top`;
    const emptyRow = (msg: string, cols: number) => `<tr><td colspan="${cols}" style="padding:10px 16px;color:#888;font-style:italic;font-size:13px">${msg}</td></tr>`;

    // ── Build per-manager reports ────────────────────────────────────────
    // Determine which silos each manager should receive
    interface ManagerSilo { name: string; email: string; silo: string; siloLabel: string }
    const managerSilos: ManagerSilo[] = [];

    for (const s of staffRows) {
      if (s.role === "sr_manager") {
        // Sr. managers get all service silos
        for (const silo of SERVICE_SILOS) {
          managerSilos.push({ name: s.name, email: s.email, silo, siloLabel: SILO_LABELS[silo] || silo });
        }
      } else if (s.role === "manager" && s.service_silo) {
        managerSilos.push({ name: s.name, email: s.email, silo: s.service_silo, siloLabel: SILO_LABELS[s.service_silo] || s.service_silo });
      } else if (s.role === "parts_manager") {
        // Parts managers get a parts-focused report
        managerSilos.push({ name: s.name, email: s.email, silo: "parts_insurance", siloLabel: SILO_LABELS["parts_insurance"] || "Parts & Insurance" });
      }
    }

    // Group by email — each manager gets ONE email with all their silos
    const emailGroups: Record<string, { name: string; silos: { silo: string; siloLabel: string }[] }> = {};
    for (const ms of managerSilos) {
      if (!emailGroups[ms.email]) emailGroups[ms.email] = { name: ms.name, silos: [] };
      emailGroups[ms.email].silos.push({ silo: ms.silo, siloLabel: ms.siloLabel });
    }

    // ── Email transport ─────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    let emailsSent = 0;
    const errors: string[] = [];

    for (const [email, group] of Object.entries(emailGroups)) {
      try {
        const firstName = group.name.split(" ")[0];
        const siloNames = group.silos.map(s => s.siloLabel).join(", ");

        // ── Build sections per silo ───────────────────────────────────
        let siloSections = "";
        let hasAnyDollarValue = false;

        let isFirstSilo = true;
        for (const { silo, siloLabel } of group.silos) {
          // ── Section 1: Work List for this manager + silo ────────────
          const managerWL = (workListByManager[email] || [])
            .filter((wl: any) => {
              // For sr_managers, filter by silo; for regular managers, show all their entries
              if (group.silos.length > 1 && wl.service_silo) return wl.service_silo === silo;
              if (group.silos.length > 1 && !wl.service_silo) return isFirstSilo;
              return true;
            })
            .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999));

          let wlRows = "";
          let wlTotal = 0;

          if (managerWL.length > 0) {
            for (const wl of managerWL) {
              const ro = roMap[wl.ro_id];
              if (!ro) continue;
              const days = daysOnLot(ro);
              const val = Number(ro.dollar_value) || 0;
              wlTotal += val;
              if (parseFloat(ro.dollar_value || 0) > 0) hasAnyDollarValue = true;
              const dayColor = days > 60 ? "color:#dc2626;font-weight:700" : "color:#374151";
              const roName = wl.ro_name || `${ro.customer_name || "Unknown"} — ${ro.rv || ""}`;
              wlRows += `<tr><td style="${td};font-weight:600">${roName}</td><td style="${td}">${urgencyBadge(ro.urgency)}</td><td style="${td};${dayColor}">${days}d</td><td style="${td};text-align:right;font-weight:600">${fmtDollars(val)}</td></tr>`;
            }
          }

          const wlRowCount = managerWL.filter((wl: any) => roMap[wl.ro_id]).length;
          const isEmptyWL = !wlRows;

          // ── Empty Work List red banner ──────────────────────────────
          const emptyWLBanner = `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px 20px;margin:8px 0 16px;text-align:center"><p style="margin:0 0 6px;font-size:18px;font-weight:800;color:#dc2626">\u{1F6A8} YOUR WORK LIST IS EMPTY</p><p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5">You have no ROs on your Work List. Add the ROs your team is actively working on to your Work List in the dashboard — <strong>right now, before you start your day.</strong></p></div>`;

          // ── Stale Work List detection (3+ days since newest item) ───
          let isStaleWL = false;
          if (wlRowCount > 0) {
            const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
            const timestamps = managerWL
              .filter((wl: any) => roMap[wl.ro_id])
              .map((wl: any) => new Date(wl.created_at).getTime())
              .filter((t: number) => !isNaN(t));
            if (timestamps.length > 0) {
              const newest = Math.max(...timestamps);
              isStaleWL = newest < threeDaysAgo.getTime();
            }
          }

          const staleWLBanner = `<div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:8px;padding:16px 20px;margin:8px 0 16px;text-align:center"><p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#b45309">\u{26A0}\u{FE0F} YOUR WORK LIST APPEARS STALE</p><p style="margin:0;font-size:13px;color:#78350f;line-height:1.5">Your Work List hasn't been updated in <strong>3+ days</strong>. Review it now — remove completed ROs and add new ones. <strong>Your list should reflect what your team is working on today.</strong></p></div>`;

          const wlTableRows = wlRows;

          // ── Section 2: RVs Waiting for this silo's work ─────────────
          let waitingRows = "";
          let waitingROs: any[] = [];

          if (silo !== "parts_insurance") {
            // Get ROs that have non-completed WOs for this silo
            const siloWOs = wosBySilo[silo] || [];
            for (const wo of siloWOs) {
              const ro = roMap[wo.ro_id];
              if (ro) {
                // Get assigned tech for this WO
                const techEmails = techsByWO[wo.id];
                const techNames = techEmails
                  ? Array.from(techEmails).map(e => techNameMap[e] || e).join(", ")
                  : "Unassigned";
                waitingROs.push({ ...ro, _woStatus: wo.status, _woDollar: wo.dollar_value, _techNames: techNames });
              }
            }
            // Sort by priority spec
            waitingROs = sortROs(waitingROs);
          } else {
            // Parts managers: show ROs with open parts requests
            waitingROs = (allROs || [])
              .filter((ro: any) => ro.has_open_parts_request === true)
              .map((ro: any) => ({ ...ro, _techNames: ro.technician ? (techNameMap[ro.technician] || ro.technician) : "—" }));
            waitingROs = sortROs(waitingROs);
          }

          if (waitingROs.length > 0) {
            waitingROs.forEach((ro: any, idx: number) => {
              const days = daysOnLot(ro);
              const dayColor = days > 60 ? "color:#dc2626;font-weight:700" : "color:#374151";
              const rawVal = silo !== "parts_insurance" ? ro._woDollar : ro.dollar_value;
              const val = Number(rawVal) || 0;
              if (parseFloat(ro.dollar_value || 0) > 0) hasAnyDollarValue = true;
              const roName = `${ro.customer_name || "Unknown"} — ${ro.rv || ""}`;
              waitingRows += `<tr><td style="${td};color:#888;font-weight:600;text-align:center">${idx + 1}</td><td style="${td};font-weight:600">${roName}</td><td style="${td};${dayColor}">${days}d</td><td style="${td}">${urgencyBadge(ro.urgency)}</td><td style="${td}">${roTypeBadge(ro.ro_type)}</td><td style="${td};text-align:right;font-weight:600">${fmtDollars(val)}</td><td style="${td};font-size:12px">${ro._techNames || "—"}</td></tr>`;
            });
          }
          const waitingTableRows = waitingRows || emptyRow("No RVs waiting — all caught up.", 7);

          // ── Section 3: Key Flags ────────────────────────────────────
          const flagItems: string[] = [];

          // Critical urgency ROs on their work list
          const criticalWL = managerWL.filter((wl: any) => {
            const ro = roMap[wl.ro_id];
            return ro && ro.urgency === "Critical";
          });
          if (criticalWL.length > 0) {
            flagItems.push(`<span style="color:#991b1b;font-weight:700">CRITICAL:</span> ${criticalWL.length} RO${criticalWL.length > 1 ? "s" : ""} on your list marked Critical — ${criticalWL.map((wl: any) => { const r = roMap[wl.ro_id]; return wl.ro_name || (r ? `${r.customer_name || "Unknown"} — ${r.rv || ""}` : "?"); }).join(", ")}`);
          }

          // Overdue ROs (on lot > 60 days) in their silo
          const overdueROs = waitingROs.filter((ro: any) => daysOnLot(ro) > 60);
          if (overdueROs.length > 0) {
            flagItems.push(`<span style="color:#dc2626;font-weight:700">OVERDUE:</span> ${overdueROs.length} RV${overdueROs.length > 1 ? "s" : ""} on lot more than 60 days — ${overdueROs.map((ro: any) => `${ro.customer_name || "Unknown"} — ${ro.rv || ""} (${daysOnLot(ro)}d)`).join(", ")}`);
          }

          // Parts blocking this silo's work
          if (silo !== "parts_insurance") {
            const siloROIds = new Set(waitingROs.map((ro: any) => ro.id));
            const blockedParts: any[] = [];
            for (const roId of siloROIds) {
              const parts = blockingPartsByRO[roId];
              if (parts) blockedParts.push(...parts);
            }
            if (blockedParts.length > 0) {
              flagItems.push(`<span style="color:#9a3412;font-weight:700">PARTS HOLD:</span> ${blockedParts.length} part${blockedParts.length > 1 ? "s" : ""} on order blocking your silo's work`);
            }
          }

          const flagsHtml = flagItems.length > 0
            ? flagItems.map(f => `<div style="padding:6px 0;font-size:13px;line-height:1.5;border-bottom:1px solid #f5f5f5">⚠️ ${f}</div>`).join("")
            : `<div style="padding:8px 0;color:#16a34a;font-size:13px;font-weight:600">All clear — no flags for ${siloLabel}.</div>`;

          // ── Assemble silo section ───────────────────────────────────
          const siloHdr = group.silos.length > 1
            ? `<div style="background:#1e293b;color:#fff;padding:10px 16px;border-radius:6px 6px 0 0;margin-top:24px;margin-bottom:0"><span style="font-size:16px;font-weight:700">${siloLabel}</span></div>`
            : "";

          // Build Work List content: table with rows, empty banner, or table + stale banner
          const wlHeader = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:12px"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e293b">Your Active Work List</p><p style="margin:0;font-size:12px;color:#64748b">This is what you actively have in your Work List — keep this list current daily.</p></div>`;

          let wlContent: string;
          if (isEmptyWL) {
            // Empty work list — show red banner instead of table
            wlContent = `${wlHeader}${emptyWLBanner}`;
          } else {
            // Has items — show table + total + optional stale banner
            wlContent = `${wlHeader}<table style="width:100%;border-collapse:collapse;margin-bottom:4px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden"><thead><tr><th style="${th}">RO Name</th><th style="${th}">Urgency</th><th style="${th}">Days</th><th style="${th};text-align:right">Value</th></tr></thead><tbody>${wlTableRows}</tbody></table><div style="text-align:right;padding:4px 10px 14px;font-size:15px;font-weight:700;color:#1e293b">Total: ${fmtDollars(wlTotal)}</div>${isStaleWL ? staleWLBanner : ""}`;
          }

          siloSections += `${siloHdr}<div style="margin-top:${group.silos.length > 1 ? "0" : "20"}px">${wlContent}<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:12px"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e293b">${silo === "parts_insurance" ? "ROs with Open Parts Requests" : `RVs Waiting for ${siloLabel} Work`}</p><p style="margin:0;font-size:12px;color:#64748b">Sorted by: longest on lot → urgency → RO type</p></div><table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden"><thead><tr><th style="${th}">#</th><th style="${th}">RO Name</th><th style="${th}">Days</th><th style="${th}">Urgency</th><th style="${th}">Type</th><th style="${th};text-align:right">Value</th><th style="${th}">Tech</th></tr></thead><tbody>${waitingTableRows}</tbody></table><div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:16px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#92400e">Key Flags</p>${flagsHtml}</div></div>`;
          isFirstSilo = false;
        }

        // ── Data quality warning banner (all values $0) ────────────
        const dataQualityBanner = !hasAnyDollarValue
          ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:6px;padding:12px 16px;margin-bottom:20px"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#991b1b">⚠️ Data Quality Notice</p><p style="margin:0;font-size:13px;color:#7f1d1d">All RO dollar values in this report are $0.00. The financial totals and Work List value summary will not be meaningful until dollar values are entered on active ROs in the dashboard. Please update RO values to get accurate financial visibility.</p></div>`
          : "";

        // ── Assemble full email HTML ──────────────────────────────────
        const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:16px;color:#1a1a1a;background:#fff"><div style="background:#1e293b;padding:16px 20px;border-radius:8px 8px 0 0"><h1 style="color:#fff;margin:0;font-size:18px">Patriots RV Services</h1><p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Morning Manager Report &nbsp;&middot;&nbsp; ${dateStr}</p></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:14px 20px;margin-bottom:20px"><p style="margin:0;font-size:15px;color:#1e293b">Good morning <strong>${firstName}</strong> — Your <strong>${siloNames}</strong> Manager Report</p></div>${dataQualityBanner}${siloSections}<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb"><p style="margin:0;color:#888;font-size:11px">Patriots RV Services &nbsp;&middot;&nbsp; Denton, TX &nbsp;&middot;&nbsp; <a href="tel:9404885047" style="color:#c8102e">(940) 488-5047</a><br>Automated morning report from the PRVS Dashboard &nbsp;&middot;&nbsp; Mon–Fri at 8 AM CDT</p></div></body></html>`;

        // ── Plain text fallback ───────────────────────────────────────
        const plainText = [
          `PRVS Morning Manager Report — ${dateStr}`,
          ``,
          `Good morning ${firstName} — ${siloNames}`,
          ``,
          `Open the PRVS Dashboard for full details: https://patriotsrv.github.io/rv-dashboard/`,
          ``,
          `Patriots RV Services — (940) 488-5047`,
        ].join("\n");

        const subject = `PRVS Manager Report — ${firstName} — ${siloNames} — ${dateStr}`;

        await transporter.sendMail({
          from:    `"Patriots RV Services" <${gmailUser}>`,
          replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
          to:      email,
          subject,
          text:    plainText,
          html:    htmlBody,
        });

        emailsSent++;
      } catch (emailErr) {
        console.error(`Error sending to ${email}:`, emailErr);
        errors.push(`${email}: ${String(emailErr)}`);
      }
    }

    const summary = {
      success:    true,
      version:    "v1.3",
      emailsSent,
      totalManagers: Object.keys(emailGroups).length,
      errors:     errors.length > 0 ? errors : undefined,
    };

    console.log("Manager report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-manager-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
