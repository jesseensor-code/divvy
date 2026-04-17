-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — enable realtime + add missing columns
-- Paste into the Supabase SQL editor and run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Missing columns (from post-initial-migration additions) ─────────────────

alter table participants add column if not exists avatar_id integer;
alter table menu_items   add column if not exists type text;

-- ─── Enable Supabase Realtime on the four tables that need it ────────────────
-- Supabase Realtime uses PostgreSQL's logical replication (publication).
-- Adding a table to the publication is what makes changes broadcast to clients.

alter publication supabase_realtime add table tabs;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table item_splits;

-- ─── REPLICA IDENTITY for item_splits ────────────────────────────────────────
-- By default, DELETE events only send the PK (id) in the payload.
-- Our client handles this correctly for item_splits (deletes by id).
-- If you ever need the full old row on DELETE, run:
--
--   alter table item_splits replica identity full;
--
-- For now the default (PK only) is sufficient.
