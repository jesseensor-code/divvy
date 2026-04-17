-- ─────────────────────────────────────────────────────────────────────────────
-- Divvy — initial schema
-- Paste this into the Supabase SQL editor and run it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Venues ──────────────────────────────────────────────────────────────────

create table if not exists venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Case-insensitive venue name search (powers the autocomplete on the home screen)
create index if not exists venues_name_lower_idx on venues (lower(name));

-- ─── Menu items ───────────────────────────────────────────────────────────────
-- One row per item type per venue.
-- Populated passively as items are added to tabs — no manual menu management needed.
-- `price` is updated to the most recently observed price.
-- `emoji` stores the override chosen by the user (if any).

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues (id) on delete cascade,
  name        text not null,
  price       numeric(10, 2) not null,
  emoji       text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (venue_id, name)   -- one canonical row per item name per venue
);

create index if not exists menu_items_venue_idx on menu_items (venue_id);
create index if not exists menu_items_name_lower_idx on menu_items (venue_id, lower(name));

-- ─── Tabs ─────────────────────────────────────────────────────────────────────

create table if not exists tabs (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references venues (id) on delete cascade,
  name           text not null,
  tip_percent    numeric(5, 2) not null default 12.5,
  status         text not null default 'open' check (status in ('open', 'locked')),
  mode           text not null check (mode in ('pub', 'restaurant')),
  creator_token  text not null,
  created_at     timestamptz not null default now()
);

-- ─── Participants ─────────────────────────────────────────────────────────────

create table if not exists participants (
  id          uuid primary key default gen_random_uuid(),
  tab_id      uuid not null references tabs (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists participants_tab_idx on participants (tab_id);

-- ─── Items ────────────────────────────────────────────────────────────────────

create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  tab_id       uuid not null references tabs (id) on delete cascade,
  name         text not null,
  total_price  numeric(10, 2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists items_tab_idx on items (tab_id);

-- ─── Item splits ──────────────────────────────────────────────────────────────

create table if not exists item_splits (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references items (id) on delete cascade,
  participant_id  uuid not null references participants (id) on delete cascade,
  shares          integer not null default 1 check (shares > 0),
  unique (item_id, participant_id)
);

create index if not exists item_splits_item_idx on item_splits (item_id);
create index if not exists item_splits_participant_idx on item_splits (participant_id);

-- ─── Row-level security ───────────────────────────────────────────────────────
-- Everything is public read/write for now (no auth yet).
-- We'll tighten this when auth is added — creator_token will gate mutations.

alter table venues       enable row level security;
alter table menu_items   enable row level security;
alter table tabs         enable row level security;
alter table participants enable row level security;
alter table items        enable row level security;
alter table item_splits  enable row level security;

-- Allow anon role to read and write everything
create policy "anon full access" on venues       for all to anon using (true) with check (true);
create policy "anon full access" on menu_items   for all to anon using (true) with check (true);
create policy "anon full access" on tabs         for all to anon using (true) with check (true);
create policy "anon full access" on participants for all to anon using (true) with check (true);
create policy "anon full access" on items        for all to anon using (true) with check (true);
create policy "anon full access" on item_splits  for all to anon using (true) with check (true);
