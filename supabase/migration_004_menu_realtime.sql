-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — enable realtime on menu_items
-- Paste into the Supabase SQL editor and run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Allows inventory zones on all joined devices to update live when the creator
-- adds or edits menu items via the Edit Menu page.

alter publication supabase_realtime add table menu_items;
