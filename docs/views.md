# Views and components

## Routes (`src/App.tsx`)

| Route | Page | Purpose |
|---|---|---|
| `/` | `Home.tsx` | Create a new tab. Venue name has live autocomplete against existing `venues` rows; picking an existing venue carries its ID forward so its menu pre-loads on the tab screen. Tip presets: 10% / 12.5% / 15%. |
| `/tab/:id` | `Tab.tsx` | The tab itself — renders `TableTabView` (open) or `LockedTabView` (locked). See below. |
| `/tab/:id/menu` | `EditMenuPage.tsx` | Edit the venue's reusable menu items (name, emoji, price, category type) inline. Creator-only in practice (linked from the tab header only for `isCreator`), though the route itself isn't access-gated. |
| `/tab/:id/items` | `EditItemsPage.tsx` | Review and remove already-committed line items — for fixing mistakes (wrong item, duplicate) after the fact. Each row shows item, price, who it's split with. |

`TabProvider` wraps the whole router (in `App.tsx`, above `BrowserRouter`), so
tab state survives navigation between these routes without re-fetching.

## `Tab.tsx` — the open/locked switch

`Tab.tsx` is the only place that branches on `tab.status`:

- **`status === 'open'`** → header (venue, share/invite button), the main
  `TableTabView` viewport, a sticky total strip with "Preview bill" /
  "Edit tab" / (creator-only) "Close tab", and the full breakdown
  (`TabSummaryBar`) below the fold.
- **`status === 'locked'`** → `LockedTabView` entirely replaces the above.

Locking has a two-step confirm: tapping "Close tab" with unassigned items
present arms a warning ("N items not assigned. Close anyway?") rather than
locking immediately; a second tap confirms.

`SelfIdentifyModal` is rendered unconditionally in both branches — it
no-ops internally if the device has already identified or is the creator,
but locked tabs still need to let late arrivals self-identify so they can
see their own card and toggle their `paid` status.

## `TableTabView.tsx` — the only interactive tab view

Despite the `tab.mode: 'pub' | 'restaurant'` column still existing on the
schema, **this is currently the only tab view** — `Home.tsx` hardcodes
`mode: 'pub'` on every tab it creates, and `Tab.tsx` doesn't branch on mode
at all. An earlier `ClassicTabView` (itemized-list entry, for `'restaurant'`
mode) existed but had zero import sites and was removed as dead code; it's
recoverable from git history if restaurant-mode entry is revived.

What it actually does: an SVG virtual table with participant avatars seated
around it (`@dnd-kit` for drag-and-drop), an inventory pool of menu items
above, and drag-or-tap assignment of items onto seats. Includes a "fun
toast" system — item-specific, occasionally SA-flavoured messages that pop
up above a participant's seat when an item is assigned to them, including
ones triggered by *other* devices' assignments arriving over realtime
(`lastForeignAssignment` in `TabContext`).

## `LockedTabView.tsx` — read-only settlement

Shown to every device once `tab.status === 'locked'`. Layout:
- Header: venue, tab name, locked badge.
- "Your card" (if self-identified): personal item breakdown + a paid toggle.
- Everyone else's cards: item breakdown + paid status, read-only unless
  you're the creator.
- Footer: grand total + settlement progress (how many participants have
  paid).

Permissions inside this view: the creator can toggle anyone's `paid` flag; a
self-identified participant can toggle only their own; everyone else is
read-only. This matches the DB-level trigger restricting `participants.paid`
writes to the tab owner (self-toggling your own `paid` flag works because
the *participant* — not just the owner — is allowed by the trigger logic;
see [database.md](database.md) for the exact rule).

## Supporting components

- **`SelfIdentifyModal.tsx`** — prompts a non-creator device to pick an
  existing participant or add themselves as new. Creators land directly on
  the "add new" form since the participant table starts empty for them.
  Skipped once `selfParticipantId` is set (persisted per-device).
- **`TabSummaryBar.tsx`** — the full per-participant breakdown shown below
  the fold on the open-tab view.
- **`BillModal.tsx`** — receipt-style preview of the whole bill, opened from
  "Preview bill" on the total strip.

## Styling

No CSS framework or component library — every component defines its own
inline `style` objects (see the `s: Record<string, React.CSSProperties>`
pattern at the bottom of most component files). The current theme ("Last
Call" — amber accent on warm dark backgrounds) is applied per-component
rather than via shared tokens/CSS variables; `#1A1410` is the elevated-panel
surface colour, `#0D0A07` the base page background, `#E8A030` the amber
accent — these recur across files as literal hex values, not constants.
