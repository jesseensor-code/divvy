-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — seat order
-- Paste into the Supabase SQL editor and run.
--
-- Lets participants be dragged into a custom order around the virtual table.
-- Backfills existing rows by created_at so current layouts don't visually
-- reshuffle when this ships. RLS already allows any authenticated session to
-- update participants (migration_005), so no policy changes needed here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table participants add column if not exists position integer;

with ordered as (
  select id, row_number() over (partition by tab_id order by created_at) - 1 as rn
  from participants
)
update participants p set position = o.rn
from ordered o
where o.id = p.id and p.position is null;

alter table participants alter column position set default 0;
alter table participants alter column position set not null;
