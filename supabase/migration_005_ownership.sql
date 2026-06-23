-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — tab ownership + enforced RLS
-- Paste into the Supabase SQL editor and run.
--
-- Replaces the client-only `creator_token` model with a real owner_id tied to
-- Supabase Anonymous Auth (auth.uid()). PoC test data is wiped — there's
-- nothing worth migrating yet.
--
-- Permission model:
--   - venues, items, item_splits: open to any authenticated (incl. anonymous)
--     session — anyone with the tab link can add items and assign splits.
--   - menu_items: anyone can add a new item (passive menu building); only the
--     tab owner (via is_venue_owner) can edit price/icon or delete an item.
--   - tabs: anyone can read; only the owner can update (tip%, lock) or delete.
--   - participants: anyone can add/update — except the `paid` column, which a
--     trigger restricts to the owning tab's owner (self-serve removed).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Wipe PoC test data ────────────────────────────────────────────────────────

truncate table item_splits, items, participants, tabs, menu_items, venues cascade;

-- ─── tabs: replace creator_token with a real owner ────────────────────────────

alter table tabs drop column if exists creator_token;
alter table tabs add column owner_id uuid not null references auth.users (id);

-- ─── Helper functions ──────────────────────────────────────────────────────────
-- security invoker (not definer) — the underlying `tabs` SELECT policy is
-- already open to authenticated, so no elevated privilege is needed, and this
-- avoids the security-definer-RPC advisor warning entirely.

create or replace function public.is_tab_owner(p_tab_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1 from public.tabs where id = p_tab_id and owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_tab_owner(uuid) from anon, public;

create or replace function public.is_venue_owner(p_venue_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1 from public.tabs where venue_id = p_venue_id and owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_venue_owner(uuid) from anon, public;

-- ─── participants.paid: owner-only, enforced via trigger (not RLS) ────────────
-- RLS is row-level; `paid` needs column-level protection while name/avatar_id
-- stay open to any participant, so a trigger checks it instead.

create or replace function public.enforce_paid_owner_only()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.paid is distinct from old.paid and not public.is_tab_owner(old.tab_id) then
    raise exception 'only the tab owner can change paid status';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_paid_owner_only() from anon, authenticated, public;

drop trigger if exists participants_paid_owner_only on participants;
create trigger participants_paid_owner_only
  before update on participants
  for each row
  execute function public.enforce_paid_owner_only();

-- ─── RLS: drop the old permissive policies ────────────────────────────────────

drop policy if exists "anon full access" on venues;
drop policy if exists "anon full access" on menu_items;
drop policy if exists "anon full access" on tabs;
drop policy if exists "anon full access" on participants;
drop policy if exists "anon full access" on items;
drop policy if exists "anon full access" on item_splits;

-- ─── venues ─────────────────────────────────────────────────────────────────────

create policy "authenticated read" on venues
  for select to authenticated using (true);
create policy "authenticated insert" on venues
  for insert to authenticated with check (true);

-- ─── menu_items ─────────────────────────────────────────────────────────────────

create policy "authenticated read" on menu_items
  for select to authenticated using (true);
create policy "authenticated insert" on menu_items
  for insert to authenticated with check (true);
create policy "owner update" on menu_items
  for update to authenticated using (is_venue_owner(venue_id)) with check (is_venue_owner(venue_id));
create policy "owner delete" on menu_items
  for delete to authenticated using (is_venue_owner(venue_id));

-- ─── tabs ───────────────────────────────────────────────────────────────────────

create policy "authenticated read" on tabs
  for select to authenticated using (true);
create policy "owner insert" on tabs
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update" on tabs
  for update to authenticated using (is_tab_owner(id)) with check (is_tab_owner(id));
create policy "owner delete" on tabs
  for delete to authenticated using (is_tab_owner(id));

-- ─── participants ───────────────────────────────────────────────────────────────

create policy "authenticated read" on participants
  for select to authenticated using (true);
create policy "authenticated insert" on participants
  for insert to authenticated with check (true);
create policy "authenticated update" on participants
  for update to authenticated using (true) with check (true);

-- ─── items ──────────────────────────────────────────────────────────────────────

create policy "authenticated read" on items
  for select to authenticated using (true);
create policy "authenticated insert" on items
  for insert to authenticated with check (true);
create policy "authenticated update" on items
  for update to authenticated using (true) with check (true);
create policy "authenticated delete" on items
  for delete to authenticated using (true);

-- ─── item_splits ────────────────────────────────────────────────────────────────

create policy "authenticated read" on item_splits
  for select to authenticated using (true);
create policy "authenticated insert" on item_splits
  for insert to authenticated with check (true);
create policy "authenticated update" on item_splits
  for update to authenticated using (true) with check (true);
create policy "authenticated delete" on item_splits
  for delete to authenticated using (true);
