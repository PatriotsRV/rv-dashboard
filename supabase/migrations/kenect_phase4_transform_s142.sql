-- ============================================================================
-- KENECT PHASE 4 TRANSFORM — staging → live inbox (Session 142, 2026-07-16)
-- Per docs/specs/KENECT_EXTRACTION_SPEC.md §4 (S141-corrected targets).
--
-- Source:   kenect_conversations_raw (3,200) · kenect_messages_raw (56,279)
--           · kenect_attachments_raw (7,756 downloaded + 640 skipped video)
-- Target:   public.conversations (new threads status='closed')
--           public.messages (context='kenect_import')
--
-- IDEMPOTENT + DELTA-SAFE: re-runnable as-is after the 7/21 delta pull
-- refreshes staging. Conversations upsert ON CONFLICT (phone_key) DO NOTHING;
-- messages dedupe on the NEW messages.kenect_message_id unique index.
--
-- Locked decisions (Roland S139/S141/S142):
--   · imported threads status='closed' (hidden by messages.html default Open filter)
--   · provenance marker = messages.context='kenect_import' (conversations has no
--     source column; conversation_events CHECK doesn't allow an import event — skipped)
--   · import ALL message kinds (S142) — auto-responses, review requests, web
--     forms, payment texts included; full-fidelity history
--   · media_url entries = bare storage paths 'kenect-media/<path>' (PRIVATE
--     bucket); js/messaging.js v1.475 mints signed URLs at render (S142)
--   · Kenect-era our-side line = office number +19404885047 (the textable line
--     customers used pre-PB). Threading only keys off the CUSTOMER side, so
--     this is cosmetic/historical.
--   · skipped-video messages get a bracketed placeholder line appended to body
--
-- Run in the Supabase SQL editor (MCP is read-only). Single transaction.
-- ============================================================================

-- ── 1) Delta-safe external id on messages (spec §4 prerequisite) ───────────
alter table public.messages add column if not exists kenect_message_id bigint;
create unique index if not exists messages_kenect_message_id_key
  on public.messages (kenect_message_id);

-- ── 2) Conversations: insert Kenect-only phone_keys (11 existing PB threads
--       are untouched — their Kenect history merges in via messages only) ──
with kc as (
  select
    c.conversation_id,
    c.payload->>'remoteDestination'                                        as display_phone,
    right(regexp_replace(coalesce(c.payload->>'remoteDestination',''), '\D', '', 'g'), 10) as phone_key,
    (c.payload->>'createdAt')::timestamptz                                 as k_created_at,
    nullif(c.payload->'contactIds'->>0,'')::bigint                         as contact_id
  from kenect_conversations_raw c
),
km_last as (   -- newest message per Kenect conversation
  select distinct on (m.conversation_id)
    m.conversation_id,
    (m.payload->>'sentAt')::timestamptz                                    as last_at,
    case when (m.payload->>'outbound')::boolean then 'outbound' else 'inbound' end as last_dir
  from kenect_messages_raw m
  order by m.conversation_id, (m.payload->>'sentAt')::timestamptz desc
)
insert into public.conversations
  (phone_key, display_phone, customer_name, status, last_message_at, last_direction, created_at)
select
  kc.phone_key,
  kc.display_phone,
  nullif(trim(coalesce(ct.payload->>'displayName',
                       concat_ws(' ', ct.payload->>'firstName', ct.payload->>'lastName'))), ''),
  'closed',
  kl.last_at,
  kl.last_dir,
  coalesce(kc.k_created_at, now())
from kc
left join kenect_contacts_raw ct on ct.contact_id = kc.contact_id
left join km_last kl            on kl.conversation_id = kc.conversation_id
where length(kc.phone_key) = 10
on conflict (phone_key) do nothing;

-- ── 3) Messages: full import, dedupe on kenect_message_id ──────────────────
with conv as (
  select conversation_id, payload->>'remoteDestination' as cust_phone
  from kenect_conversations_raw
),
att as (       -- downloaded media paths per message + skipped-video count
  select
    message_id,
    array_agg('kenect-media/' || storage_path order by attachment_id)
      filter (where downloaded and storage_path is not null)               as media,
    count(*) filter (where not downloaded)                                 as skipped
  from kenect_attachments_raw
  group by message_id
)
insert into public.messages
  (kenect_message_id, direction, phone_to, phone_from, body, media_url,
   context, status, created_at)
select
  m.message_id,
  case when ob then 'outbound' else 'inbound' end,
  case when ob then conv.cust_phone else '+19404885047' end,
  case when ob then '+19404885047' else conv.cust_phone end,
  nullif(concat_ws(e'\n',
    nullif(m.payload->>'body',''),
    case when coalesce(att.skipped,0) > 0
         then '[' || att.skipped || ' video attachment' ||
              case when att.skipped > 1 then 's' else '' end || ' not imported]'
    end), ''),
  att.media,
  'kenect_import',
  case when ob
       then case when m.payload->>'externalStatus' = 'DELIVERED' then 'delivered' else 'sent' end
       else 'received' end,
  coalesce((m.payload->>'sentAt')::timestamptz,
           (m.payload->>'createdAt')::timestamptz,
           m.pulled_at)
from kenect_messages_raw m
cross join lateral (select (m.payload->>'outbound')::boolean as ob) o
join conv on conv.conversation_id = m.conversation_id
left join att on att.message_id = m.message_id
on conflict (kenect_message_id) do nothing;

-- ── 4) Bump thread recency where Kenect has something newer (matters on the
--       delta re-run; never clobbers a PB thread with newer PB activity) ────
with knew as (
  select
    right(regexp_replace(coalesce(c.payload->>'remoteDestination',''), '\D', '', 'g'), 10) as phone_key,
    max((m.payload->>'sentAt')::timestamptz)                               as last_at
  from kenect_messages_raw m
  join kenect_conversations_raw c on c.conversation_id = m.conversation_id
  group by 1
)
update public.conversations c
set last_message_at = knew.last_at
from knew
where c.phone_key = knew.phone_key
  and (c.last_message_at is null or knew.last_at > c.last_message_at);

-- ============================================================================
-- VERIFICATION (run each after the migration; expected first-run values)
-- ============================================================================
-- select count(*) from messages where context='kenect_import';   -- 56,279
-- select count(*) from conversations;                            -- 3,211 (22 pre + 3,189 new)
-- select count(*) from conversations where status='closed';
-- -- no dupes possible: unique index. orphan check (must be 0):
-- select count(*) from kenect_messages_raw m
--   left join messages x on x.kenect_message_id = m.message_id
--   where x.id is null;
-- -- media rows carried over (must equal count of messages w/ downloaded media = 4,217):
-- select count(*) from messages where context='kenect_import' and media_url is not null;
-- -- spot-check a deep thread (William Wixon / Rick McClung) in messages.html "All"
