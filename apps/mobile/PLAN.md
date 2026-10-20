# Mobile app plan — Technician feature parity

The mobile app (`apps/mobile`) replicates only the subset of web functionality a
**Technician** needs to do field work. No admin/tenant-settings functionality is in
scope — that stays web-only. Admins may sign in occasionally, but sign-in is **not**
gated by role: any authenticated user can log in, and the app simply doesn't contain
admin screens to show them.

## Grounding facts (from a codebase research pass, 2026-10-20)

- The unit of field work is the **Dispatch** (a scheduled visit, `assignedUserId` = one
  tech), not the WorkOrder — a WorkOrder can have many dispatches/trips. There is
  **no "my jobs today" view anywhere today**; the web app (`DispatchesPage`) is 100%
  dispatcher-perspective and is itself a stop-gap (the real dispatch board isn't merged
  yet — see branches `feat/dispatch-board` / `feat/board-map`). The mobile "Today"
  screen is net-new UX, not a port.
- **Parts-used logging doesn't exist anywhere** (web or backend) — explicitly deferred
  placeholders throughout. Left out of this plan; it would need its own cross-platform
  design effort later.
- **Signature capture and on-site payment collection don't exist anywhere** either —
  genuinely new product surface, not a mobile port. Payment approach: **card-present
  tap-to-pay SDK** (e.g. Stripe Terminal), chosen over a payment-link or
  signature-only approach. Needs backend reconciliation work in `dispatch-api` too,
  and a PCI/compliance conversation before locking in.
- **Push notifications are also net-new** — no device-token storage or notification
  events exist today. Needs new `dispatch-api` endpoints, not just mobile UI.
- **No hardcoded "Technician" role** — roles are tenant-configurable capability
  bundles. `Role.performsFieldWork: boolean` is the one purpose-built signal (already
  consumed by dispatch-board/assignment pickers), but it is **not** used to gate
  sign-in — scope is limited by which screens exist, not by blocking login.
- Technicians **can belong to multiple tenants** — the mobile shell needs a
  lightweight port of web's `TenantGate`/workspace switcher, not a single-tenant
  assumption.

## Visual direction

Two directions were mocked up side by side in a Claude Design project
("Dispatch Mobile — Technician UI Directions") before any screen was built for real:

- **A — Dashboard Continuity** (chosen): reuses the web app's exact color tokens
  (`apps/web/src/styles/tokens.css`) and the "warm trade orange" accent exactly as
  it's used today — a trim/accent color, not a dominant one. Dark app bar + tab bar
  mirror the web sidebar, which tokens.css calls out as "intentionally dark in both
  themes." Same card density and status-pill conventions a dispatcher already reads
  all day.
- **B — Field Ticket** (not chosen): pushed the same accent hue into a dominant,
  hi-vis identity color on a warm paper background, with tear-off-ticket card shapes
  and a "what do I do right now" layout (countdown to next job, single CTA).

Direction A's tokens are ported to React Native in `apps/mobile/src/theme/tokens.ts`
(oklch → hex, since RN's StyleSheet has no `oklch()`/`color-mix()` support — keep
that file in lockstep with web's if a token value changes there).

## Phased plan

0. **Component library** (current phase): design tokens + `ThemeProvider`, and the
   core primitives — `Button`, `StatusPill`, `Card`, `Avatar`, `AppHeader`, `Stepper`,
   `DispatchRow` — assembled on a style-guide screen to dial in the look before any
   real screen depends on it.
1. **Shell**: tab nav (Today / Schedule / Lookup / Profile), sign-in open to any
   authenticated user (no role gate), tenant/workspace switcher.
2. **Today / Schedule / My Availability**: net-new, reshapes dispatcher-facing data
   into a single-tech view.
3. **Dispatch detail**: lifecycle timeline + tech-initiated status transitions,
   call/directions.
4. **Work order detail (tech subset)**: overview, work items + photos, files,
   activity/notes — no Purchasing tab, no Estimate-tab editing, no billing.
5. **Completion**: signature + card-present payment (net-new, cross-repo).
6. **On-site work order creation**: trimmed intake, auto-assigns a dispatch to self.
7. **Reference lookup**: customers/service-locations/equipment, read-only, no billing.
8. **Push notifications** (needs new `dispatch-api` endpoints — device tokens, events).
9. **Profile/account**: profile, sign out, workspace switcher.

## Why

Technician-only feature parity was the explicit ask, scoped phase by phase rather than
guessed at — the grounding facts above came from reading the actual web app and shared
packages, not assumption. The visual direction was settled with a side-by-side mockup
before investing in real components, so the look doesn't need to change mid-build.
