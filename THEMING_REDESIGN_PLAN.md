# Visual redesign: TailAdmin-style density + dark-first semantic theming

## Context

The dispatch-ui app uses Catalyst UI on Tailwind v4. CSR/dispatcher users find the current UI visually boring and not dense enough compared to modern dense admin tools like TailAdmin. A previous ThemeProvider effort (`d35ffec`, `2dabe1e`, `7e92c0c`) added only light/dark toggling and persistence; it did not solve either the density or the visual-interest problem and is considered a failed first attempt.

**Goal:** Make the app feel like a modern dense ops dashboard (TailAdmin's density, Linear/Vercel's restraint, INSPINIA's semantic color richness) while keeping Catalyst primitives underneath for accessibility.

**Out of scope:** multi-tenant branded theming, chart libraries, a full TailAdmin Pro license purchase, migrating every page at once (we migrate 2–3 representative pages and ship reusable primitives; other pages adopt incrementally).

## Phase 1 — Token contract + shell chrome

Highest-leverage change. Delivers the "does this feel less boring?" answer on its own.

### 1a. Semantic token system (`src/index.css`)

Add an `@theme` block with semantic tokens. Dark values are the defaults; `.light` class overrides them for light mode. The existing `@variant dark` directive stays, so `dark:` variants across 66 files keep working during incremental migration.

Tokens defined: surface (base/raised/sunken/overlay), text (primary/secondary/tertiary/inverted), border (subtle/default/strong), accent, semantic status (success/warning/danger/info/neutral), dispatch priority (urgent/high/normal/low).

### 1b. Dark-first default (`src/contexts/ThemeContext.tsx`)

Change the `useState` initializer fallback from `'system'` to `'dark'`. Also update `applyTheme` to toggle a `.light` class on `<html>` alongside the existing `.dark` toggle, so token overrides work for light mode. The API persistence and class-toggle mechanism are unchanged.

### 1c. Dense shell (`src/components/shell/DenseSidebarLayout.tsx`)

Fork of Catalyst's `SidebarLayout` with density fixes:
- Sidebar `w-60` (240px, was 264px)
- No rounded content card, no `p-10`, no `shadow`, no `ring`, no `max-w-screen-2xl` cap
- Desktop topbar strip (`h-12`, `sticky top-0`, `bg-surface-raised`, `border-b border-zinc-800`) — `{navbar}` renders here on desktop
- Content fills the remaining space with `p-3`

### 1d. Rebuilt shell (`src/components/AppLayout.tsx`)

- Switches to `DenseSidebarLayout`
- Sidebar group headings (Equipment, Financial, Scheduling, Admin) become collapsible buttons with a chevron; state persisted in `localStorage`
- Sidebar gap between sections reduced (`mt-2` instead of `mt-8`)
- Brand logo updated from indigo-600 to sky-600 (accent token)
- Topbar (navbar slot): breadcrumb on left, ⌘K search stub on right
- Theme toggle stays in user dropdown (sidebar footer)
- Removes `<div className="p-2">` wrapper — `DenseSidebarLayout` provides `p-3`

## Phase 2 — Shared density primitives (`src/components/shell/`)

Pull repeated patterns out of pages:

- **`PageHeader`** — title + subtitle + trailing actions (replaces the hand-written `flex items-center justify-between` header in every page)
- **`Toolbar`** — `mt-2` InputGroup search + status filter segmented control + trailing row-count
- **`DataTable`** — wrapper around Catalyst `Table dense` with baked-in `[--gutter:theme(spacing.1)] text-sm`, loading skeleton, empty state
- **`FormRow`** — 12-col grid with `<Label className="text-xs">` default
- **`StatusBadge`** — consolidates 11 ad-hoc `STATUS_COLORS` maps across pages into one semantic helper

## Phase 3 — Migrate representative pages

Migrate three pages to the new primitives as proof; leave others to adopt as-touched:

1. `src/pages/CustomersPage.tsx`
2. `src/pages/WorkOrdersPage.tsx`
3. `src/pages/DispatchesPage.tsx`
4. `src/components/CustomerFormDialog.tsx` — adopt `FormRow`

## Phase 4 — Visual richness pass

After Phase 1–3 feel right:

- KPI/stat strip component for dashboard page
- Row priority accent bar (2px left border, priority token) on dispatches/work-orders
- Active nav item: subtle `bg-sky-500/10` background (replaces Catalyst's thin 2px bar)
- Context panel slot (right rail, 320px) in `DenseSidebarLayout` via Catalyst `Slideover`

## Critical files

**New files:**
- `src/components/shell/DenseSidebarLayout.tsx`
- `src/components/shell/PageHeader.tsx`
- `src/components/shell/Toolbar.tsx`
- `src/components/shell/DataTable.tsx`
- `src/components/shell/FormRow.tsx`
- `src/components/shell/StatusBadge.tsx`

**Modified files:**
- `src/index.css` — `@theme` block + `.light` overrides
- `src/components/AppLayout.tsx` — `DenseSidebarLayout`, collapsible groups, topbar breadcrumb
- `src/contexts/ThemeContext.tsx` — dark-first default, `.light` class toggle
- `src/pages/CustomersPage.tsx`, `WorkOrdersPage.tsx`, `DispatchesPage.tsx`
- `src/components/CustomerFormDialog.tsx`

**Do not modify:**
- `src/components/catalyst/*` — fork as needed, never edit in-place

## Verification

1. `npm run dev` → open http://localhost:5173
2. First load (no `localStorage.theme`) renders dark ✓
3. Theme toggle in user menu persists across reload ✓
4. `/customers` shows ≥20 rows above the fold on 1080p (target: ≥30 on 1440p)
5. Sidebar groups collapse/expand; state survives reload ✓
6. Breadcrumb updates on navigation ✓
7. `npm run lint` → zero errors
8. `npm test -- --run` → all tests pass
