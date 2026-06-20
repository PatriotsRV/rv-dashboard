-- ER completion notification — Session 119 (2026-06-20)
-- Adds hand-written completion fields to enhancement_requests and a DB trigger
-- that emails the requester (via the send-er-completion edge fn / pg_net) when an
-- ER transitions to status='done'. Additive + idempotent.

-- 1. Columns (additive, nullable). completion_notes = "what we did";
--    test_steps = "how to confirm it works"; completion_emailed_at = dedupe stamp.
alter table public.enhancement_requests
  add column if not exists completion_notes      text,
  add column if not exists test_steps            text,
  add column if not exists completion_emailed_at timestamptz;

-- 2. Trigger function — fire only on the transition INTO 'done', once.
--    Mirrors the cron edge-fn invocation pattern (net.http_post + vault service key).
create or replace function public.notify_er_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'done'
     and (OLD.status is distinct from 'done')
     and NEW.completion_emailed_at is null then
    perform net.http_post(
      url := 'https://axfejhudchdejoiwaetq.supabase.co/functions/v1/send-er-completion',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := jsonb_build_object('er_id', NEW.id)
    );
  end if;
  return NEW;
end;
$$;

-- 3. Trigger (drop-and-recreate so this migration is re-runnable).
drop trigger if exists trg_notify_er_completion on public.enhancement_requests;
create trigger trg_notify_er_completion
  after update on public.enhancement_requests
  for each row
  execute function public.notify_er_completion();
