-- ============================================================
-- send_checkin_reminder_1030_s197.sql  (Session 197, 2026-10-06, Roland)
-- ============================================================
-- Adds the 10:30 AM CT SECOND REMINDER cron for ALL techs (early + main rosters).
-- Reuses invoke_send_checkin_reminder(p_cohort) from the S162 migration;
-- the edge fn (v1.1) maps cohort "1030" to early + main rosters + firmer text.
-- 10:30 CDT = 15:30 UTC (same DST caveat as the S162 jobs: during CST
-- these fire one hour earlier wall-clock; accepted S162).
-- Idempotent: safe to re-run.
-- ============================================================

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-checkin-reminder-1030am') then
    perform cron.schedule('send-checkin-reminder-1030am', '30 15 * * 1-5',
      'SELECT invoke_send_checkin_reminder(''1030'')');
  end if;
end $$;

-- VERIFY: expect three rows (815am / 930am / 1030am), all active.
select jobname, schedule, active, command from cron.job
  where jobname like 'send-checkin-reminder-%' order by jobname;
