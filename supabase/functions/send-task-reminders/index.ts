// ============================================================
// send-task-reminders (Task Manager Phase 1, Session 186, 2026-08-27)
// ============================================================
// v1.0: TASK NAG LOOP — SMS + email reminders for open tasks.
// Spec: docs/specs/TASK_MANAGER_SPEC.md §5.
//
// Fired by pg_cron every 30 min, 8:00 AM - 5:30 PM CT weekdays
// (invoke_send_task_reminders(), migration task_manager_s186.sql).
// The cron window IS the quiet-hours rule — no task SMS after hours.
//
// For each task with status='open' where:
//   now >= due_at - remind_lead_minutes, AND
//   (never reminded, OR last_reminded_at older than remind_every_minutes)
// send:
//   1. SMS to assignee's staff.phone_number via Textly (checkin-reminder
//      mechanics — direct send, no conversations row, inbox stays clean)
//   2. Email via scheduled_notifications (source='task_reminder' — the
//      source CHECK was widened in task_manager_s186.sql), delivered by
//      the existing process-scheduled-notifications 15-min cron.
// ESCALATION: reminder_count >= 3 AND past due → assigner is CC'd on the
// email and gets their own SMS ("still open after N reminders").
// Each send bumps reminder_count / last_reminded_at and writes a
// task_events row ('reminder_sent' / 'escalated').
//
// Request body (all optional):
//   { "dry_run": true,   report what WOULD be sent, send nothing
//     "force": true }    bypass the weekday guard (testing)
//
// Config (app_config, optional):
//   task_reminder_enabled  "false" = kill switch (default on)
//
// ⚠️ Deploy (cron invoker sends no auth header — S183 lesson: EVERY
// redeploy must repeat the flag or inbound dies silently):
//   supabase functions deploy send-task-reminders --no-verify-jwt
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_API_BASE = "https://vestednetworks-txb.textable.app";
const DEFAULT_FROM_E164 = "+19404885047";
const ESCALATE_AFTER = 3; // reminders past due before the assigner is pulled in
const SYSTEM_EMAIL = "system@patriotsrvservices.com";
const BOARD_URL = "https://patriotsrv.github.io/rv-dashboard/tasks.html";

function chicagoWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(d);
}

function fmtChicago(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
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
    if (!resp.ok) console.error(`task reminder SMS Textly HTTP ${resp.status} to ${to}`);
    return resp.ok;
  } catch (e) {
    console.error("task reminder SMS failed:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { dry_run?: boolean; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const dryRun = !!body.dry_run;

  const now = new Date();
  const wd = chicagoWeekday(now);
  if ((wd === "Sat" || wd === "Sun") && !body.force) {
    return json({ ok: true, action: "skipped_weekend", weekday: wd });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Kill switch
  const { data: cfg } = await sb.from("app_config")
    .select("value").eq("key", "task_reminder_enabled").maybeSingle();
  if (cfg && String(cfg.value).toLowerCase() === "false") {
    return json({ ok: true, action: "disabled_by_config" });
  }

  // Eligible tasks: open, inside the nag window, cadence elapsed.
  // The lead/cadence math runs here (columns are per-task), not in SQL.
  const { data: tasks, error: tErr } = await sb.from("tasks")
    .select("id, title, ro_display_id, assigned_to_email, assigned_by_email, due_at, remind_lead_minutes, remind_every_minutes, reminder_count, last_reminded_at, escalated_at, priority")
    .eq("status", "open")
    .order("due_at", { ascending: true })
    .limit(200);
  if (tErr) return json({ ok: false, error: tErr.message }, 500);

  const nowMs = now.getTime();
  const due = (tasks || []).filter((t) => {
    const windowOpen = nowMs >= new Date(t.due_at).getTime() - t.remind_lead_minutes * 60_000;
    const cadenceOk = !t.last_reminded_at ||
      nowMs >= new Date(t.last_reminded_at).getTime() + t.remind_every_minutes * 60_000;
    return windowOpen && cadenceOk;
  });
  if (!due.length) return json({ ok: true, action: "nothing_due", checked: (tasks || []).length });

  // Phone lookup for everyone we might text (assignees + assigners)
  const emails = [...new Set(due.flatMap((t) =>
    [t.assigned_to_email.toLowerCase(), t.assigned_by_email.toLowerCase()]))];
  const { data: staff, error: sErr } = await sb.from("staff")
    .select("email, name, phone_number").eq("active", true).in("email", emails);
  if (sErr) return json({ ok: false, error: sErr.message }, 500);
  const staffByEmail = new Map(
    (staff || []).map((s) => [String(s.email || "").toLowerCase(),
      { name: s.name || s.email, phone: (s.phone_number || "").trim() }]));

  const results: Record<string, unknown>[] = [];
  for (const t of due) {
    const overdue = nowMs > new Date(t.due_at).getTime();
    const escalate = overdue && t.reminder_count >= ESCALATE_AFTER;
    const assignee = staffByEmail.get(t.assigned_to_email.toLowerCase());
    const assigner = staffByEmail.get(t.assigned_by_email.toLowerCase());
    const roBit = t.ro_display_id ? ` (${t.ro_display_id})` : "";
    const dueBit = overdue ? `was due ${fmtChicago(t.due_at)}` : `due ${fmtChicago(t.due_at)}`;
    const nth = t.reminder_count + 1;

    const smsBody =
      `PRVS Task${t.priority === "urgent" ? " 🔴" : ""}: ${t.title}${roBit} — ${dueBit}.` +
      (nth > 1 ? ` Reminder #${nth}.` : "") +
      ` Mark it done: ${BOARD_URL}`;
    const escSms =
      `PRVS Task you assigned is STILL OPEN after ${t.reminder_count} reminders: ` +
      `${t.title}${roBit} — assigned to ${assignee?.name || t.assigned_to_email}, ${dueBit}. ${BOARD_URL}`;

    if (dryRun) {
      results.push({ task: t.id, title: t.title, would_sms: !!assignee?.phone, escalate });
      continue;
    }

    // 1. SMS to assignee
    let smsSent = false;
    if (assignee?.phone) smsSent = await textlySend(assignee.phone, smsBody);

    // 2. Email via scheduled_notifications (assignee; assigner CC'd on escalation)
    const recipients = [t.assigned_to_email];
    if (escalate) recipients.push(t.assigned_by_email);
    const { error: nErr } = await sb.from("scheduled_notifications").insert({
      scheduled_at: now.toISOString(),
      recipient_emails: recipients,
      subject: `${escalate ? "🚨 STILL OPEN: " : "📌 Task reminder: "}${t.title}${roBit}`,
      body:
        `Task:        ${t.title}\n` +
        (t.ro_display_id ? `RO:          ${t.ro_display_id}\n` : "") +
        `Assigned to: ${assignee?.name || t.assigned_to_email}\n` +
        `Assigned by: ${assigner?.name || t.assigned_by_email}\n` +
        `Due:         ${fmtChicago(t.due_at)}${overdue ? "  (OVERDUE)" : ""}\n` +
        `Reminders:   ${nth}\n\n` +
        `Mark it done on the task board: ${BOARD_URL}\n` +
        `You will keep getting this until the task is marked done.`,
      source: "task_reminder",
      created_by_email: SYSTEM_EMAIL,
    });
    if (nErr) console.error(`task ${t.id} email enqueue failed: ${nErr.message}`);

    // 3. Escalation SMS to assigner (once per pass while escalated)
    let escSmsSent = false;
    if (escalate && assigner?.phone) escSmsSent = await textlySend(assigner.phone, escSms);

    // 4. Bump counters + event trail
    const patch: Record<string, unknown> = {
      reminder_count: nth, last_reminded_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    if (escalate && !t.escalated_at) patch.escalated_at = now.toISOString();
    const { error: uErr } = await sb.from("tasks").update(patch).eq("id", t.id);
    if (uErr) console.error(`task ${t.id} counter bump failed: ${uErr.message}`);

    const { error: eErr } = await sb.from("task_events").insert({
      task_id: t.id,
      event: escalate ? "escalated" : "reminder_sent",
      actor_email: SYSTEM_EMAIL,
      detail: `#${nth}; sms=${smsSent}; email=${!nErr}${escalate ? `; assigner_sms=${escSmsSent}` : ""}`,
    });
    if (eErr) console.error(`task ${t.id} event write failed: ${eErr.message}`);

    results.push({ task: t.id, title: t.title, reminder: nth, smsSent, escalate });
  }

  return json({ ok: true, dry_run: dryRun, reminded: results.length, results });
});
