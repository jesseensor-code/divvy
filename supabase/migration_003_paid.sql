-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — add paid flag to participants
-- Paste into the Supabase SQL editor and run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Participants can mark themselves as having settled up.
-- The creator can also mark anyone as paid.
-- Default false — everyone starts unpaid.

alter table participants add column if not exists paid boolean not null default false;
