import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// GH#18: Parts status report — called by Supabase pg_cron at 8 AM + 3 PM CDT Mon-Fri
// v1.3: Added contextual action prompts above each section + end-of-day checklist on 3 PM send
// v1.4: Fixed action prompt rendering — merged into single table per section
// v1.5: Action prompts as standalone div blocks — email client safe
// v1.6: Larger fonts, numbered action steps per section
// v1.7: Minified inline styles to fix Gmail clipping
// v1.8: Exclude parts_status='estimate' from Section 1 (estimate-only requests are for quoting, not ordering)
//        Also added deleted_at IS NULL guard to Section 1 query
// v1.9: Drop-dead-simple ACTION-FIRST rebuild (S93) for a non-technical parts manager. Top verdict banner
//        (ALL GOOD vs N THINGS TO DO) + three fixed boxes: Order These / Call the Supplier / Came In-Receive.
//        Call the Supplier = overdue ETAs + ordered-with-no-ETA past a 3-business-day grace (NO_ETA_GRACE_BIZ_DAYS).
//        On-order-on-track is a one-line footnote. Requested/Ordered aware.
// Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser    = Deno.env.get("GMAIL_USER");
    const gmailPass    = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Service-role client — bypasses RLS
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── Determine report time label ─────────────────────────────────────
    const now        = new Date();
    const utcHour    = now.getUTCHours();
    const isMorning  = utcHour < 17; // before 5 PM UTC = before 12 PM CDT (morning send is 13:00 UTC / 8 AM CDT)
    const timeLabel  = isMorning ? "Morning" : "Afternoon";
    const dateStr    = now.toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── 1. Open parts requests (has_open_parts_request=true, not received, not estimate-only) ──
    // Exclude 'estimate': estimate-only requests are for quoting purposes — Bobby doesn't need to order them.
    // Exclude 'received': already fulfilled.
    // Exclude soft-deleted ROs (deleted_at IS NULL).
    const { data: openROs, error: e1 } = await sb
      .from("repair_orders")
      .select("id, ro_id, customer_name, rv, parts_status, requested_by_email, updated_at")
      .eq("has_open_parts_request", true)
      .not("parts_status", "eq", "received")
      .not("parts_status", "eq", "estimate")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (e1) console.error("Error fetching open ROs:", e1);

    // Fetch individual parts for open ROs
    const openROIds = (openROs || []).map((ro: any) => ro.id).filter(Boolean);
    const openROPartsMap: Record<string, string[]> = {};
    if (openROIds.length > 0) {
      const { data: openROPartsList } = await sb
        .from("parts")
        .select("part_name, status, ro_id")
        .in("ro_id", openROIds)
        .not("status", "eq", "Received");
      for (const p of (openROPartsList || [])) {
        if (!openROPartsMap[p.ro_id]) openROPartsMap[p.ro_id] = [];
        openROPartsMap[p.ro_id].push(
          p.part_name + (p.status ? " (" + p.status + ")" : "")
        );
      }
    }

    // ── 2. Parts: ordered but not yet received ──────────────────────────
    const { data: orderedParts, error: e2 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, date_ordered, created_at, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
      .in("status", ["Ordered", "In Transit", "Backordered"])
      .order("eta", { ascending: true, nullsFirst: false });
    if (e2) console.error("Error fetching ordered parts:", e2);

    // ── 3. Overdue parts (ETA < today, not received) ────────────────────
    const todayStr = now.toISOString().split("T")[0];
    const { data: overdueParts, error: e3 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
      .lt("eta", todayStr)
      .not("status", "eq", "Received")
      .order("eta", { ascending: true });
    if (e3) console.error("Error fetching overdue parts:", e3);

    // ── 4. Parts received in last 24 hours ──────────────────────────────
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const { data: receivedParts, error: e4 } = await sb
      .from("parts")
      .select("id, part_name, part_number, eta, status, updated_at, ro_id, repair_orders(ro_id, customer_name, rv)")
      .eq("status", "Received")
      .gte("updated_at", yesterday)
      .order("updated_at", { ascending: false });
    if (e4) console.error("Error fetching received parts:", e4);

    // ── Get recipient list (managers + sr_managers + parts_managers) ────
    const { data: staff, error: e5 } = await sb
      .from("staff")
      .select("name, email, role")
      .in("role", ["sr_manager", "manager", "parts_manager"]);
    if (e5) console.error("Error fetching staff:", e5);

    const recipients = [...new Set(
      (staff || []).map((s: any) => s.email).filter(Boolean)
    )];

    if (!recipients.length) {
      return new Response(JSON.stringify({ error: "No manager recipients found in staff table" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Shared style constants ───────────────────────────────────────────
    const thStyle = `padding:6px 10px;text-align:left;font-size:12px;font-weight:600;color:#555;border-bottom:1px solid #e5e7eb;background:#f9fafb`;
    const tdStyle = `padding:7px 10px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top`;

    const emptyRow = (msg: string) => `<tr><td colspan="6" style="padding:10px 16px;color:#888;font-style:italic;font-size:13px">${msg}</td></tr>`;

    const tableWrap = (rows: string, cols: string[]) => `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;overflow:hidden"><thead><tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;

    // ── ACTION-FIRST REPORT (v1.9) — one verdict + three fixed "do this" boxes, same layout every send ──

    // 1) ORDER THESE PARTS — RO-level requests not yet ordered (requested / sourcing / legacy-null)
    const isOnOrderPs = (ps: string) => ps === "ordered" || ps === "outstanding";
    const needsOrderingROs = (openROs || []).filter((ro: any) => !isOnOrderPs(ro.parts_status));

    // 2) CALL THE SUPPLIER = overdue (ETA passed) + ordered-with-no-ETA past a 3-business-day grace
    // 3) CAME IN = receivedParts (last 24h)   [overdue + received already fetched]

    // 3-business-day grace before an ordered part with no ETA becomes a "call the supplier" to-do
    const NO_ETA_GRACE_BIZ_DAYS = 3;
    const bizDaysAgo = (n: number) => {
      const d = new Date(now);
      let c = 0;
      while (c < n) { d.setUTCDate(d.getUTCDate() - 1); const dow = d.getUTCDay(); if (dow !== 0 && dow !== 6) c++; }
      return d.getTime();
    };
    const staleCutoff = bizDaysAgo(NO_ETA_GRACE_BIZ_DAYS);
    const orderedAtMs = (p: any) => { const d = p.date_ordered || p.created_at; return d ? new Date(d).getTime() : 0; };

    const lateIds = new Set((overdueParts || []).map((p: any) => p.id));
    // ordered, no ETA, sitting past the grace window -> needs a supplier call
    const staleNoEta = (orderedParts || []).filter((p: any) => !p.eta && !lateIds.has(p.id) && orderedAtMs(p) <= staleCutoff);
    const staleIds = new Set(staleNoEta.map((p: any) => p.id));

    // FYI only (nothing to do): on order, not late, not stale — future ETA or still inside the grace window
    const waitingParts = (orderedParts || []).filter((p: any) => !lateIds.has(p.id) && !staleIds.has(p.id));
    const freshNoEtaCount = waitingParts.filter((p: any) => !p.eta).length;

    const callCount = (overdueParts?.length || 0) + staleNoEta.length;
    // total things-to-do = order + call-supplier + came-in
    const toDoCount = needsOrderingROs.length + callCount + (receivedParts?.length || 0);

    // ── item line builder (plain bullets, not technical tables) ──
    const li = (html: string) => `<div style="font-size:15px;color:#1f2937;line-height:1.5;margin:0 0 5px">&bull; ${html}</div>`;
    const orderItems = needsOrderingROs.map((ro: any) => {
      const parts = (openROPartsMap[ro.id] || []).map((s: string) => s.replace(/ \([^)]*\)$/, "")).join(", ");
      return li(`<strong>${ro.customer_name || ("RO " + (ro.ro_id || ""))}</strong>${ro.rv ? " &mdash; " + ro.rv : ""}${parts ? " &mdash; " + parts : ""}`);
    }).join("");
    const fmtShort = (s: string) => { try { return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }); } catch (e) { return s; } };
    const lateItems = (overdueParts || []).map((p: any) =>
      li(`<strong>${p.part_name || "Part"}</strong> &mdash; ${p.repair_orders?.customer_name || "—"} &mdash; <span style="color:#b91c1c;font-weight:700">was due ${p.eta ? fmtShort(p.eta) : "—"}</span>`)
    ).join("");
    const staleItems = staleNoEta.map((p: any) =>
      li(`<strong>${p.part_name || "Part"}</strong> &mdash; ${p.repair_orders?.customer_name || "—"} &mdash; <span style="color:#b45309;font-weight:700">no delivery date yet</span>${p.date_ordered ? ` (ordered ${fmtShort(p.date_ordered)})` : ""}`)
    ).join("");
    const callItems = lateItems + staleItems;
    const cameInItems = (receivedParts || []).map((p: any) =>
      li(`<strong>${p.part_name || "Part"}</strong> &mdash; ${p.repair_orders?.customer_name || "—"} &mdash; arrived`)
    ).join("");

    // ── box renderer: colored when there is work, green "all clear" when empty ──
    const box = (emoji: string, title: string, count: number, items: string, todo: string, emptyMsg: string, color: string, bg: string) => {
      const has = count > 0;
      const body = has
        ? `<div style="padding:12px 16px">${items}<div style="margin-top:10px;font-size:15px;font-weight:700;color:${color}">&#128073; ${todo}</div></div>`
        : `<div style="padding:11px 16px;font-size:15px;font-weight:600;color:#15803d">&#10003; ${emptyMsg}</div>`;
      return `<div style="border:2px solid ${has ? color : "#bbf7d0"};border-radius:10px;margin-bottom:14px;overflow:hidden"><div style="background:${has ? bg : "#f0fdf4"};padding:11px 16px"><span style="font-size:18px;font-weight:800;color:${has ? color : "#15803d"}">${emoji} ${title}</span>${has ? `<span style="margin-left:8px;background:${color};color:#fff;font-size:13px;font-weight:800;padding:1px 9px;border-radius:11px">${count}</span>` : ""}</div>${body}</div>`;
    };

    const orderBox  = box("&#128722;", "ORDER THESE PARTS", needsOrderingROs.length, orderItems, `Call the supplier, place the order, then tap "Parts Ordered" on the screen.`, "Nothing to order right now.", "#b45309", "#fffbeb");
    const callBox   = box("&#128222;", "CALL THE SUPPLIER", callCount, callItems, "Call the supplier, get a delivery date, and put it on the screen.", "Nobody to chase right now.", "#b91c1c", "#fef2f2");
    const cameInBox = box("&#128229;", "CAME IN &mdash; RECEIVE THEM", receivedParts?.length || 0, cameInItems, "Mark it Received on the screen and text the tech.", "Nothing came in.", "#15803d", "#f0fdf4");

    // ── top verdict banner ──
    const verdict = toDoCount === 0
      ? `<div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:18px 20px;margin-bottom:18px;text-align:center"><div style="font-size:23px;font-weight:800;color:#15803d">&#9989; ALL GOOD</div><div style="font-size:15px;color:#166534;margin-top:3px">Nothing to do right now.</div></div>`
      : `<div style="background:#fff7ed;border:2px solid #f97316;border-radius:12px;padding:18px 20px;margin-bottom:18px;text-align:center"><div style="font-size:23px;font-weight:800;color:#9a3412">&#128073; YOU HAVE ${toDoCount} THING${toDoCount > 1 ? "S" : ""} TO DO</div><div style="font-size:15px;color:#9a3412;margin-top:3px">Go through the boxes below, top to bottom.</div></div>`;

    // ── waiting footnote (on order, not due yet — nothing to do) ──
    const waitingNote = waitingParts.length
      ? `<div style="margin-top:6px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;color:#475569">&#128077; ${waitingParts.length} part${waitingParts.length > 1 ? "s are" : " is"} on order and on track &mdash; nothing to do, just waiting.${freshNoEtaCount > 0 ? ` (${freshNoEtaCount} just ordered, still waiting on a date &mdash; that's normal for the first few days.)` : ""}</div>`
      : "";

    // ── Assemble full HTML email ─────────────────────────────────────────
    const hasSomething = (openROs?.length || 0) + (orderedParts?.length || 0) +
                         (overdueParts?.length || 0) + (receivedParts?.length || 0) > 0;

    // Shared minified styles for section headers and badges
    const secHdr = (bg: string) => `margin-bottom:4px;padding:12px 16px 10px;background:${bg};border-radius:6px 6px 0 0;border:1px solid #e5e7eb;border-bottom:none`;
    const secAct = (bg: string) => `padding:9px 16px 10px;background:${bg};border:1px solid #e5e7eb;border-top:none;border-bottom:2px solid #e5e7eb;margin-bottom:0`;
    const badge = `margin-left:8px;background:rgba(0,0,0,0.12);color:#333;font-size:11px;padding:2px 7px;border-radius:10px;font-weight:600`;
    const secTitle = `font-size:15px;font-weight:700;color:#111`;
    const actSpan = (color: string, text: string) => `<span style="font-size:15px;font-weight:600;color:${color}">→ ${text}</span>`;

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#1a1a1a;background:#fff"><div style="border-bottom:3px solid #c8102e;padding-bottom:12px;margin-bottom:16px"><h1 style="color:#c8102e;margin:0;font-size:20px">Patriots RV &mdash; Parts</h1><p style="margin:4px 0 0;color:#555;font-size:13px">${timeLabel} check &middot; ${dateStr}</p></div>${verdict}${orderBox}${callBox}${cameInBox}${waitingNote}<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb"><p style="margin:0;color:#888;font-size:11px">Open the dashboard: <a href="https://patriotsrv.github.io/rv-dashboard/" style="color:#c8102e">patriotsrv.github.io/rv-dashboard</a><br>Patriots RV Services &middot; Denton, TX &middot; (940) 488-5047 &middot; Automated ${timeLabel.toLowerCase()} report, Mon-Fri 8 AM &amp; 3 PM CDT</p></div></body></html>`;

    // ── Send email ──────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const subject = toDoCount === 0
      ? `PRVS Parts - ${timeLabel} - All good, nothing to do`
      : `PRVS Parts - ${timeLabel} - ${toDoCount} thing${toDoCount > 1 ? "s" : ""} to do${callCount ? ` (${callCount} to chase)` : ""}`;

    const plainText = [
      `PRVS PARTS - ${timeLabel} - ${dateStr}`,
      ``,
      toDoCount === 0 ? `ALL GOOD. Nothing to do right now.` : `YOU HAVE ${toDoCount} THING(S) TO DO:`,
      ``,
      `[ ] ORDER THESE PARTS: ${needsOrderingROs.length}`,
      ...needsOrderingROs.map((ro: any) => `      - ${ro.customer_name || ro.ro_id || "RO"}${(openROPartsMap[ro.id] || []).length ? " (" + (openROPartsMap[ro.id] || []).map((s: string) => s.replace(/ \([^)]*\)$/, "")).join(", ") + ")" : ""}`),
      `[ ] CALL THE SUPPLIER: ${callCount}`,
      ...(overdueParts || []).map((p: any) => `      - ${p.part_name} (${p.repair_orders?.customer_name || "-"}) was due ${p.eta}`),
      ...staleNoEta.map((p: any) => `      - ${p.part_name} (${p.repair_orders?.customer_name || "-"}) no date yet`),
      `[ ] CAME IN - RECEIVE THEM: ${receivedParts?.length || 0}`,
      ...(receivedParts || []).map((p: any) => `      - ${p.part_name} (${p.repair_orders?.customer_name || "-"})`),
      ``,
      `${waitingParts.length} more on order, not due yet - nothing to do.`,
      ``,
      `Open dashboard: https://patriotsrv.github.io/rv-dashboard/`,
      `Patriots RV Services - (940) 488-5047`,
    ].join("\n");

    await transporter.sendMail({
      from:    `"Patriots RV Services" <${gmailUser}>`,
      replyTo: "Patriots RV Services <info@patriotsrvservices.com>",
      to:      recipients.join(", "),
      subject,
      text:    plainText,
      html:    htmlBody,
    });

    const summary = {
      success:        true,
      version:        "v1.9",
      timeLabel,
      recipients:     recipients.length,
      toDo:           toDoCount,
      needsOrdering:  needsOrderingROs.length,
      callSupplier:   callCount,
      receivedLast24: receivedParts?.length || 0,
      waiting:        waitingParts.length,
    };

    console.log("Parts report sent:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-parts-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
