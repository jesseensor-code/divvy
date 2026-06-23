# Divvy documentation

Divvy is a real-time bill-splitting app: React + Vite + TypeScript on the
frontend, Supabase (Postgres + Realtime + Auth) as the only backend, deployed
as a static SPA on Vercel. No custom server.

Start here, then go deeper via the docs below:

- **[architecture.md](architecture.md)** — local-first state model, Supabase
  sync, realtime channels, identity/auth, error handling.
- **[data-model.md](data-model.md)** — entity relationships, the shares-based
  splitting math, currency rules.
- **[database.md](database.md)** — migration history, RLS policy reference,
  how to make a schema change.
- **[views.md](views.md)** — the screens/components that make up the app and
  when each one renders.

## Orientation for a new contributor

- **Commands**: `npm run dev`, `npm run build` (typecheck + build), `npm run
  preview`. No lint/test suite — verify via `npm run build` and manual
  testing in the browser.
- **Entry point**: `src/main.tsx` resolves anonymous auth (`ensureSession()`)
  before rendering `App.tsx`.
- **Routes** (`src/App.tsx`): `/` (Home), `/tab/:id` (the tab), `/tab/:id/menu`
  (edit venue menu), `/tab/:id/items` (edit committed line items). All wrapped
  in `TabProvider`.
- **The one file to read first**: `src/context/TabContext.tsx`. It owns all
  state, all Supabase writes, and the realtime subscriptions. Nearly every
  other file in `src/` either reads from it (`useTab()`) or is called by it
  (`src/lib/db.ts`, `src/lib/calculations.ts`).
- **No backend code to deploy**: there's no API server. All backend logic is
  either client-side (TypeScript in `src/lib/`) or in Postgres itself (RLS
  policies, triggers — see `supabase/migration_005_ownership.sql`).

## What's intentionally not documented here

Anything fully derivable by reading the code — file layout, component props,
exact styling — is left out. These docs cover the *why* behind non-obvious
decisions (race conditions avoided, RLS trust boundaries, rounding rules),
which is the part that doesn't survive a `git grep`.
