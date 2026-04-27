# Work Order Detail Page — Design

Status: Draft for review
Owner: Paul Wilcox

This document captures the design decisions for the Work Order detail page — the most important page in the application. It is the operational hub where CSRs, dispatchers, and managers spend most of their day.

It is intentionally opinionated. Everything here is open to pushback, but each call has a stated reason so we can argue with the reason rather than the conclusion.

---

## 1. Why this page matters and the patterns it uses

The WO detail page is where the business actually runs:

- CSRs read/write internal notes to coordinate with dispatchers and techs.
- Dispatchers see who's assigned, when, and what's left to do.
- Office managers track quotes, invoices, payments, and POs against the job.
- Field-relevant data (equipment, files, photos) lives here.

If this page is slow, cluttered, or forces context-switching to other screens, the whole business slows down. Density and glanceability are non-negotiable.

### 1.1 Three-pattern rule

The page uses three UI patterns and three only. They do not overlap:

- **Main canvas** — the primary work surface (header + left strip + work items + activity rail). Always visible. Never hidden behind tabs.
- **Drawer** — slide-in panel from the right edge, used to *see more on a peripheral entity* (financials, etc.) without leaving the WO context. May contain internal tabs because it is itself a focused, intentional surface.
- **Dialog** — modal centered over the page, used for *create/edit forms*. Canonical Catalyst use.

If a future feature doesn't fit one of these three, that's a signal to question the feature, not to add a fourth pattern.

A drawer is a *context*; a dialog is an *action within a context*. They nest cleanly: clicking `+ New Invoice` inside the financials drawer opens a create dialog *over* the drawer, the drawer stays mounted underneath, and dialog close returns the user to the drawer (§3.5).

---

## 2. Data model decisions

These shape the UI; resolving them up front avoids painting ourselves into a corner.

### 2.1 Description belongs on the work item, not the WO

The current `WorkOrderFormDialog` has a `description` field on the WO. That field is really "first work item description" pretending to be WO metadata.

**Backend status (verified):**
- `WorkItem.description: String` already exists, NOT NULL (`work-order-service/.../entity/WorkItem.kt`).
- `WorkOrder.description: String?` is currently nullable on the WO entity.

**Decision:** Stop writing `WorkOrder.description`. Each work item already carries its own description. The WO describes *the engagement* (who, where, when, billing), not *the work*.

**Migration plan:**
1. UI stops sending `description` on WO create/update; WO create flow captures the first work item's description and creates both atomically.
2. Backfill: for any WO with `description != null` and no work items, create a single `WorkItem` from the WO's description, then null the WO field.
3. Drop the `description` column from `work_orders` once all writes have stopped.

### 2.2 Equipment is owned by the service location; work items reference it

Equipment is durable — the same condenser exists across many WOs over its lifetime.

**Decision:**
- `Equipment` is owned by `ServiceLocation`.
- `WorkItem` has a nullable `equipmentId` reference (work items don't always involve equipment — broader-than-HVAC industries may not have any).
- Equipment Profile pages (future) show full service history across every WO ever performed on a unit. We don't need to build that view now, but the data model supports it for free.

### 2.3 Financials (Invoice / Quote / PO) live at the WO level

We considered tying invoices to work items but rejected it:

- Real billing doesn't respect work-item boundaries — progress invoices, deposit + final, change orders span multiple work items or split one over time.
- One invoice combining multiple work items is a normal customer expectation.
- Same logic applies to POs and Quotes — keep them at WO level for consistency.

**Decision:** `Invoice`, `Quote`, `PurchaseOrder`, `Payment` all reference `WorkOrder`, not `WorkItem`. A WO can have many of each.

**Future-proofing (do not build now):** give `InvoiceLineItem` a nullable `workItemId` reference. Header stays at WO; lines can *optionally* point to the work item they billed for. Enables per-work-item profitability reporting later without forcing it on anyone today. Additive schema change, ship if/when needed.

### 2.4 No industry-specific fields on the core schema

Dispatch must serve broader-than-HVAC. Filter sizes, refrigerant, breaker size, tonnage, etc. are HVAC artifacts.

**Decision:** core `WorkOrder`, `WorkItem`, and `ServiceLocation` schemas stay industry-agnostic. Industry-specific data lives on:

- Equipment-type-specific custom fields (when we build equipment custom fields).
- Service-location custom fields (e.g., gate codes, after-hours contact).

The legacy "filter sizes" header chip was *generated* by scanning equipment at the location. We can revisit that pattern when we go deep on equipment, not now.

### 2.5 WO-level status rolls up from work item status categories

Each tenant-defined `WorkItemStatus` maps to a fixed `ProgressCategory` enum: `NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED | CANCELLED`. The WO's overall status (the header pill) is derived from its work items' categories — no separate WO-status field needed, no per-tenant rollup rules to design.

Rollup precedence is already implemented in `WorkOrder.recalculateProgress()` (`work-order-service/.../entity/WorkOrder.kt`):

- empty → `NOT_STARTED`
- all `COMPLETED` → `COMPLETED`
- all `CANCELLED` → `CANCELLED`
- any `BLOCKED` → `BLOCKED`
- any `IN_PROGRESS` → `IN_PROGRESS`
- else → `NOT_STARTED`

`WorkOrder.progressCategory` is a cached/denormalized field, not a source of truth.

### 2.6 Work items do not carry pricing

The `WorkItem` entity currently has `quantity`, `unitPrice`, `totalPrice` (auto-computed via `@PrePersist`/`@PreUpdate`). This was a misunderstanding when the app was scaffolded.

**Decision:** Pricing belongs on **invoices and quotes**, not on work items. The clean separation is:

- **Work item** = operational record. *What was done* — description, status, equipment ref, type.
- **Invoice / Quote** = financial record. *What was billed* — line items with their own prices, taxes, discounts.

**Why:**

- Real trades pricing is messier than 1:1 to operational scope: markups, discounts, package deals, T&M vs flat-rate, change orders, customer-specific rate sheets, taxes/fees that aren't tied to any work item.
- A quote line might bundle three work items into "system replacement"; an invoice line might split one work item across two billing periods. Forcing the work item to be the pricing unit fights real billing.
- If `WorkItem.totalPrice` exists *and* invoice line totals exist, they will drift and reports will disagree.
- Per-work-item profitability is preserved through the optional `InvoiceLineItem.workItemId` bridge in §2.3 — no need to duplicate price state on the work item itself.

**What this changes:**

- Drop `quantity`, `unitPrice`, `totalPrice` from `WorkItem` entity.
- Drop the `@PrePersist`/`@PreUpdate` price computation.
- Schema migration to drop those columns from `work_items`.
- Drop the `WorkItemType` enum entirely (`LABOR | PARTS | SERVICE | OTHER`) — its sole purpose was pricing/billing categorization; with pricing gone, the enum has no remaining role. Drop the column from `work_items` and remove the enum class.
- `WorkItemServiceTest` and any service code referencing those fields gets simpler.

---

## 3. Layout

Desktop-first (≥1280px effective width). Two columns + sticky header. Peripheral entities (financials) live in a slide-in drawer triggered from clickable header chips. No tabs in the main canvas. No bottom strip.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ STICKY HEADER (~110px)                                                   │
│  WO #1234 · [● Pending ▾] · last touched 14m ago by Jamie                │
│  Bob Smith ☎ 555-1234 ⧉ · 123 Main St ⧉ · ETA Tue 4:45 PM                │
│  $9.8K quoted · $3.2K invoiced · $0 paid · NTE $12K · Bal $3.2K          │
│  [+ Work Item] [+ Dispatch] [+ Note]              [Edit WO ▾] [⋯]        │
├──────────────────────────────────────────────────┬───────────────────────┤
│ MAIN (flex)                                      │ RIGHT RAIL (~360px)   │
│ ┌──────────────────────────────────────────────┐ │ ▶ ACTIVE DISPATCHES   │
│ │ Left strip (~240, collapsible)               │ │  Jason · ETA 4:45 PM  │
│ │   Service Location  (DescriptionList)        │ │  Daniel · ETA 8:30 AM │
│ │   Order Info       (DescriptionList)         │ │ ─────────             │
│ │   Billing (if diff)                          │ │ ACTIVITY              │
│ └──────────────────────────────────────────────┘ │ All · Notes · Disp ·$ │
│                                                  │ [+ inline note ……]    │
│ Work Items — dense Catalyst Table, expandable:   │ • Jamie note   · 14m  │
│  ● Pending     Heat Pump replace … $9.8K   [⋯]   │ • Status → IP  ·  1h  │
│  ▸ expand → equipment / notes / files / chips    │ • Invoice sent ·  2h  │
│  ● In Progress Air Handler …               [⋯]   │ • Jason out    ·  3h  │
│  ● Completed   Heat Kit …                  [⋯]   │ …                     │
└──────────────────────────────────────────────────┴───────────────────────┘

  Click any header money chip → Financial detail drawer slides in from right
  (~760–840px wide; tabs: POs · Quotes · Invoices · Payments;
   create dialogs open over the drawer, drawer stays mounted underneath)
```

### 3.1 Sticky header (~110px, three rows + action bar)

Always visible while scrolling.

- **Row 1 — Identity & state:** `WO #1234` · clickable status pill (current overall progress category; click → dropdown of allowed transitions per workflow rules) · `last touched 14m ago by Jamie`
- **Row 2 — Contact & schedule:** Customer name (linked) · click-to-contact phone · click-to-copy address · primary ETA
  - **Click-to-contact phone behavior is viewport-dependent.** On desktop (≥1024px), clicking the phone copies the number to the clipboard and shows a toast — most CSRs use a separate softphone (RingCentral, Dialpad, etc.) and `tel:` would do nothing useful. On tablet/mobile, the same control uses `tel:`. Detection by viewport width, not user agent.
- **Row 3 — Money summary chips:** `$ quoted · $ invoiced · $ paid · NTE · Balance`
  - Each segment is a clickable chip that opens the Financial detail drawer (§3.5) directly to the matching tab.
  - **Zero-value chips remain clickable.** `$0 paid` opens the Payments tab to an empty state. Consistency over special-casing.
- **Action bar:** `+ Work Item` · `+ Dispatch` · `+ Note` · `Edit WO ▾` · overflow `⋯` (Delete, Print, Duplicate, Convert to Recurring).
  - `+ Note` is intentionally available in *both* the action bar and the inline composer at the top of the activity stream (§3.4). The action bar is always-visible regardless of scroll and keyboard-shortcut-friendly; the inline composer is the dominant fast path while reading the stream. Same logic as a "Compose" button in both the email toolbar and the inbox header.

### 3.2 Left strip (~240px, collapsible)

Compact `DescriptionList` cards stacked vertically:

- **Service Location** — address, contact, link to location page, location-level notes / custom fields (when those exist).
- **Order Info** — order date, customer order #, division, type, NTE, priority.
- **Billing** — only render when billing differs from service location.

Collapses to icons (and expands on click) below 1280px (see §3.7).

### 3.3 Main canvas — Work Items

Dense Catalyst `Table` of work items with click-to-expand rows. **No tabs in this region. No financials strip below it.**

- **Row content:** drag handle (when reorder is wired up — see §7) · status pill (inline-editable) · description (inline-editable) · equipment summary (single line, model/serial as text — no thumbnails) · `⋯` per-row menu.
- **Expanded row** reveals (full-width below the row):
  - Equipment detail with sub-units (text only — no thumbnails; thumbnails belong on the equipment profile page).
  - Internal notes preview (last 2 entries).
  - Files: count + last-added timestamp (no thumbnail grid; thumbnails are a tech/manager surface).
  - Linked-entity chips: any quote/invoice/PO that references this work item (driven by the optional `InvoiceLineItem.workItemId` from §2.3, when present). Clicking a chip opens the financial detail drawer to that record.
- **Default expansion state:** all rows collapsed. CSRs scan, then expand the one they're working on.
- **Inline editing:** status pill (dropdown of allowed transitions), description (click-to-edit input), per-row delete via `⋯`.

### 3.4 Right rail (~360px)

Two stacked sections, both serving the "what's happening on this WO" question:

- **Pinned Active Dispatches widget** at the top — only renders when at least one dispatch is scheduled or in-progress within the next ~24h. Vertical list of compact dispatch cards: tech name, ETA, current dispatch status, primary action button (e.g. Check Out). Solves the dispatcher's at-a-glance need without dedicating a column to dispatches.
- **Activity stream** below the widget. Merged feed of:
  - Notes added by users.
  - Dispatch lifecycle events (assigned, departed, arrived, checked out).
  - Work item / WO status changes.
  - Financial events (quote sent, invoice issued, payment received).
- **Filter chips at top of stream:** `All · Notes · Dispatches · Status · $`.
- **Inline `+ note` composer** above the stream — text area + Save. No modal.
- **Pagination:** virtualized infinite scroll. Newest first; older events load as the rail scrolls. Long-tail WOs (months open) accumulate hundreds of events; load-all is not viable.

### 3.5 Financial detail drawer

Opens from any header money chip (§3.1, Row 3) or from a linked-entity chip on an expanded work-item row (§3.3). Slides in from the right edge, **~760–840px wide** (financial tables need width to breathe; narrower drawers cramp them).

- **Internal tabs: POs · Quotes · Invoices · Payments.** Full-width tables inside the drawer. Tabs are acceptable here only because the drawer is itself a focused, intentional surface — the §1.1 three-pattern rule explicitly carves out internal-tab usage *inside* a drawer.
- Active tab is determined by which chip the user clicked (e.g., header `$ invoiced` → Invoices tab; header `Bal $X` → Invoices tab filtered to unpaid).
- **Drawer-over-drawer / dialog-over-drawer rule:** clicking `+ New Invoice` (or any create action) inside the drawer opens a create **dialog** *over* the drawer. The drawer stays mounted underneath (visually dimmed). On dialog close, the drawer is the context the user returns to. The drawer is a *context*; the dialog is an *action within that context*. This is consistent with §1.1.
- **Closing the drawer:** click outside the drawer, click the close affordance, or press `Esc` (§3.6).

### 3.6 Inline editing and keyboard shortcuts

CSRs are half-keyboard. Inline edits and shortcuts are not optional polish — they're the primary path. Treat both as first-class.

**Inline edit affordances:**

- **Status pills** (header + per work item row): click → dropdown of allowed transitions per workflow rules. The single most-used inline op; ships in phase 2.
- **Description / NTE / type / division / priority** in header and left strip: click → inline input, save on blur or Enter, revert on Esc.
- **Work item description** on each row: click → inline input. Status edits via the pill.
- **Notes:** composer at top of activity stream. No modal.

**Keyboard shortcuts** (active when the page has focus and no input is focused):

- `N` — focus inline note composer in activity rail.
- `W` — open `+ Work Item` dialog.
- `D` — open `+ Dispatch` dialog.
- `E` — open `Edit WO` dialog.
- `/` — focus activity-stream filter.
- `Esc` — close drawer or dialog (whichever is topmost; if neither, blur the focused input).

Shortcuts ship incrementally with the surfaces they target — see §5.

### 3.7 Responsive behavior below 1280px

The two-column layout assumes ≥1280px effective width. Below that:

- **Left strip** collapses to a row of icons under the header that expand into the existing card content on click.
- **Right rail** becomes a **bottom sheet** triggered by an "Activity" button in the header action bar. The bottom sheet is the activity rail (with its pinned Active Dispatches widget), full-width, sliding up from the bottom edge. Closing returns to the main canvas.
- **Main canvas** (work items) takes the full width.
- **Financial detail drawer** still slides in but takes ~90% of the viewport on small screens.

1366×768 laptops (the realistic CSR floor) clear the 1280px bar with the left strip collapsed by default.

### 3.8 Custom components (everything else maps to Catalyst)

Two custom components are required — and only two. Build them once in `components/`; do not inline.

1. **`ExpandableTableRow`** — Catalyst `Table` does not ship row expansion. A small wrapper that toggles a hidden detail row beneath each main row. Used for the work items table (§3.3) and reusable elsewhere.
2. **`EditableField`** — generic click-to-edit field swapper. Renders a value as text; on click swaps to an input; saves on blur or Enter; reverts on Esc. Wraps any underlying input (text, number, select). Used everywhere inline editing is wired up (§3.6).

Everything else — header layout, `DescriptionList`, money chips, action bar, drawer, dialogs, status pills, badges, dropdowns, table, filter chips, activity-stream rows — maps directly to Catalyst primitives or Headless UI components Catalyst already wraps.

---

## 4. What we're cutting (legacy + earlier drafts of this doc)

| Element | Cut because | Replacement |
|---|---|---|
| **Bottom strip with summary cards** (earlier draft of this doc) | Pushes financials below the fold on dense WOs; introduces a third drill-in pattern (inline-card-grows-into-table) that conflicts with §1.1 | Header money chips → financial detail drawer (§3.5) |
| **`History` tab** (proposed in critique) | Activity stream *is* the history | Activity rail (§3.4) |
| **Three-column layout** (earlier draft) | Wastes ~340px when dispatches are quiet; legacy 2010s admin DNA | Two columns + activity rail (§3.3, §3.4) |
| **Vertical work-item cards** (earlier draft) | 2–3 items per screen; CSRs need scan, not stack of mini-dashboards | Dense expandable Catalyst Table (§3.3) |
| **Equipment thumbnails in work item rows** | CSR doesn't need photos; tech/manager surface | Model/serial as text; thumbnails on equipment profile page (later) |
| **Files thumbnail grid in work item rows** | CSR cares about "are there files?" + recency | Count + last-added timestamp |
| **Maintenance Reports as a parallel entity** | A maintenance report is a *kind* of work item, not a separate thing | Work item template |
| **Separate `Add PM Inspection` / `Add HVAC Inspection` / `Add Maintenance Report` buttons** (legacy) | Button clutter; not extensible across industries | One `+ Work Item` button → choose template |
| **"System Activities" workflow tasks** (Request Quote, Request PO, Follow Up, etc.) (legacy) | Conflates WO with task management | Future task/workflow system, separate design, only if there's real demand |
| **Schedule M–F hours block in legacy header** | Site-level data | Service location page; link from left strip |
| **Per-work-item full PO/Quote/Invoice tables in card body** (legacy + earlier draft) | Duplicates the drawer; clutters work-item rows | Linked-entity chips in expanded row + drawer for detail |
| **`Tech` tab in legacy Site/Docs/Tech/Info widget** | Less glanceable than a persistent surface | Pinned Active Dispatches widget (§3.4) |
| **Site/Docs/Tech/Info tabbed widget** (legacy) | Tabs hide data | Inline left strip + activity rail |
| **`Rates` block in right rail** (earlier draft) | Site-level data | Service location page |

---

## 5. Build order (phased, each step shippable)

Each phase produces a working page that's better than the previous. We don't ship a page that requires phase 7 to be useful. The activity rail lands early because it's the highest-value surface; inline status edit lands in phase 2 because without it phase 2 is a placeholder, not a useful page.

1. **Page skeleton** — sticky header (3 rows + action bar; click-to-copy phone behavior, money chips render values but the drawer doesn't exist yet so chip clicks no-op) + left strip with `DescriptionList` cards (Service Location, Order Info, Billing-if-different). Reachable from the WO list at `/work-orders/:id`. Header status pill renders read-only.
2. **Work items dense table + inline status pill edit.** Catalyst `Table` rendered into the main canvas. Columns: status pill (inline-editable), description, last updated. **Inline status pill edits** wire up here on the header pill and on each row — smallest, highest-frequency inline op, makes phase 2 ship as a useful page rather than a placeholder. Empty state: "No work items on this work order."

   **Row expansion is deferred.** The expanded-row content described in §3.3 (equipment detail, notes preview, files count, linked-entity chips) requires backend additions that don't exist today: equipment FK on `WorkItem`, per-work-item notes, files, and the optional `InvoiceLineItem.workItemId` from §2.3. Building the expand mechanism over an empty payload would be a half-finished implementation. The `ExpandableTableRow` custom component (§3.8) lands with the first content that needs it, not with phase 2. Drag-to-reorder (§7) and inline description edit (phase 5) are out of scope here.
3. **Activity stream + pinned Active Dispatches widget** in the right rail. Read-only feed pulling dispatches, status changes, and existing internal notes (from `WorkOrder.internalNotes`). Pagination/virtualization in place from day one. **Responsive bottom-sheet behavior (§3.7) ships here** — the activity rail is the first piece that wouldn't fit on a 1280px laptop; the bottom-sheet pattern needs to exist before users hit the wall.
4. **Work item create/edit dialog + `WorkOrder.description` → `WorkItem.description` migration.** Focused dialog with description, type, status, equipment typeahead (mirror `ServiceLocationPicker` pattern). WO create flow gains a "First work item description" field that creates WO + first work item atomically (or two sequential calls if the atomic-create endpoint in §7 is not yet resolved). `W` keyboard shortcut wires up here.
5. **Inline note creation + remaining inline edits.** Note composer at top of activity stream (no modal). Click-to-edit for description / NTE / type / division / priority / work item description — `EditableField` custom component (§3.8) built here, then reused. `N` and `/` keyboard shortcuts wire up here.
6. **Dispatch create flow + Active Dispatches widget interactivity.** `+ Dispatch` opens create dialog; widget primary actions (Check Out, etc.) wired up. `D` keyboard shortcut wires up here.
7. **Financial detail drawer.** Header money chips become live; linked-entity chips on work-item rows become live. Drawer with `POs · Quotes · Invoices · Payments` internal tabs. Create dialogs open over the drawer per §3.5. `Esc` close-topmost shortcut formalized here (it can land earlier with whatever first introduces a drawer or dialog; phase 7 just makes it the canonical close behavior across all surfaces).

Each phase ships behind the same route — `/work-orders/:id` is wired up at phase 1 and progressively gains capability.

---

## 6. UI / component conventions

- **Catalyst UI** components throughout (per CLAUDE.md). No custom HTML/Tailwind that duplicates Catalyst.
- **Dense layout** — `dense` table prop, compact spacing per `CSR_PATTERNS.md`.
- **Glossary** — every entity reference goes through `getName()` per `GLOSSARY_INTEGRATION.md`. Entity codes used: `work_order`, `work_item` (new — needs adding), `service_location`, `customer`, `equipment`, `invoice`, `quote`, `payment`, `dispatch`.
- **i18n** — parameterized `common.*` keys with `getName()`, alphabetically sorted.
- **React Query** — fetch WO + relations in a single page-level query if API supports it; otherwise parallel queries with shared loading state.

---

## 7. Open questions / deferred decisions

These do not block phase 1. Calling them out so we know they exist.

1. **Work item templates** — tenant-configurable presets that pre-fill description, default status, etc. for common cases like "PM Inspection," "HVAC Inspection," "Maintenance Report." Same `taxonomy` shape as `WorkOrderType`. Useful but not phase-1.
2. **Drag-to-reorder work items.** Worth it now, or only when WOs routinely have 3+ items? Cheap to add later if not in phase 2.
3. **Per-work-item profitability reporting** — depends on the future `InvoiceLineItem.workItemId`. Document the schema option but don't build the report.
4. **Customer-facing technician portal / customer view of the WO.** Out of scope for this page; that's a separate read-only render.
5. **Backend additions required before work-item row expansion ships.** The expanded-row content in §3.3 (equipment detail, notes preview, files, linked-entity chips) currently has no API support. Each piece needs its own backend work before it can render:
   - Equipment FK on `WorkItem` (entity addition + endpoint).
   - Per-work-item internal notes (new sub-resource; today notes are a single string on the WO).
   - Files / attachments on work items (new domain — not in any existing service yet).
   - `InvoiceLineItem.workItemId` (additive future-proofing called out in §2.3; build only when there's a use case).

   These can be tackled independently and progressively populate the expansion. Phase 2 ships without expansion; expansion is added with each piece as it lands.

**Resolved (formerly open):**

- *Audit log / activity feed* — addressed by the activity stream in §3.4. The merged feed (notes · dispatch events · status changes · financial events) *is* the audit log surface; no separate UI needed.
- *`WorkItemType` enum re-evaluation* — decided: drop the enum entirely. Captured in §2.6.
- *Atomic WO + first-work-item create endpoint* — backend change in flight (see backend instructions package).

---

## 8. Non-goals

- Customer-facing views. This page is internal.
- Mobile field tech UI. Techs need a different, simpler view; out of scope here.
- Replacement for the dispatch board. The dispatch board is its own page; this page references dispatches but doesn't manage scheduling at scale.

---

## 9. References

- `CLAUDE.md` — project conventions, CSR philosophy, Catalyst rules.
- `CSR_PATTERNS.md` — density patterns.
- `GLOSSARY_INTEGRATION.md` — entity-name patterns.
- Legacy reference screenshots — see Slack thread / chat history (not committed).
