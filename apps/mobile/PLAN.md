# Mobile app plan — Technician feature parity

The mobile app (`apps/mobile`) replicates only the subset of web functionality a
**Technician** needs to do field work. No admin/tenant-settings functionality is in
scope — that stays web-only. Admins may sign in occasionally, but sign-in is **not**
gated by role: any authenticated user can log in, and the app simply doesn't contain
admin screens to show them.

## Grounding facts (from a codebase research pass, 2026-10-20)

- The unit of field work is the **Dispatch** (a scheduled visit, `assignedUserId` = one
  tech), not the WorkOrder — a WorkOrder can have many dispatches/trips. There was
  **no "my jobs today" view anywhere** when this plan was written; the web app
  (`DispatchesPage`) was 100% dispatcher-perspective, so the mobile "Today" screen
  started as net-new UX rather than a port.
  **Superseded 2026-10-21**: web now has one — a technician landing page at `/my-day`
  (`apps/web/src/pages/MyDayPage.tsx`), built partly from what this app's Phase 2/3
  screens established, with a purpose-built `myDayApi` behind it. Today is no longer
  net-new UX; it mirrors that page. See Phase 7.
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
- **The mobile app currently has zero permission checks** — every signed-in user can
  do everything the built screens allow (status transitions, adding notes), regardless
  of their tenant-assigned role. Web already has the full system to port: a tenant
  admin assigns a flat `capabilities: string[]` to each `Role` (no enum — raw strings
  like `CREATE_WORK_ORDERS`, `EDIT_ALL_WORK_ORDERS`, `EDIT_ASSIGNED_WORK_ORDERS`) via
  `userApi.updateRoleCapabilities`; the signed-in user's own effective set comes back
  denormalized on `User.capabilities` from `GET /users/me` (`userApi.getCurrentUser`,
  no client-side merge-from-roles step). Mobile's own `useCurrentUser()`
  (`src/hooks/useCurrentUser.ts`) already fetches that same `User` for `user.id` but
  has never read `.capabilities`. See Phase 5.
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

0. **Component library** (done): design tokens (`src/theme/tokens.ts`, an oklch→hex
   port of web's `tokens.css`) + `ThemeProvider`, and the core primitives — `Button`,
   `StatusPill`, `Card`, `Avatar`, `AppHeader`, `Stepper`, `DispatchRow` — assembled on
   a style-guide screen (`src/app/style-guide.tsx`, reachable from the home screen for
   now) so the look was dialed in before any real screen depended on it.
1. **Shell** (done): tab nav (Today / Schedule / Lookup / Profile) via an
   expo-router `(tabs)` group, sign-in open to any authenticated user (no role
   gate), and a real tenant/workspace switcher — `src/tenant/` ports web's
   `TenantContext`/`TenantGate` (one AsyncStorage tier instead of web's
   session+local split, async hydration, no subdomain resolution). Profile is
   real (signed-in-as, active workspace, switcher when there's more than one
   membership, sign out); Today/Schedule/Lookup are placeholders for their own
   phases below.
2. **Today / Schedule / My Availability** (done): net-new, reshapes dispatcher-facing
   data into a single-tech view. Today is the flat list for the current local day;
   Schedule is the same data over the next 7 days grouped under day headings. My
   Availability (reachable from Profile, not its own tab) is a **view-only** list of
   upcoming time off via the real `availabilityApi` — creating/removing time off was
   deliberately left out of this pass (no existing UI to mirror, and the right
   approach — a date-range form vs. mobile-friendly quick presets — needs its own
   design decision) and is this phase's one open remainder.
   **Correction mid-phase**: Today/Schedule first shipped against
   `dispatchesApi.getAll` (`/scheduling/dispatches`), then live testing found that
   endpoint doesn't see dispatches managed through the dispatch board (a dispatch
   confirmed "En route" on the web board came back empty under every filter tried,
   including no filter at all). Switched both screens to `dispatchBoardApi.
   getBoard({date})` — the board's current source of truth, which also fixed a
   latent timezone bug for free (the board resolves `date` in the tenant's own
   timezone server-side; the old approach required the client to get that right).
3. **Dispatch detail** (done): lifecycle timeline (from `dispatchesApi.getById` —
   confirmed, unlike the list endpoint, single-record reads ARE trusted for
   board-managed dispatches, per web's own DispatchDetailDrawer using the same
   call), tech-initiated status transitions (Mark en route / Mark arrived /
   Complete — the exact status values lifted from web's drawer, not guessed), and
   call/directions (site contact phone + full address come from `workOrderApi.
   getById`, the one call that has them — neither the board row nor the plain
   Dispatch carries a phone number). Deliberately dropped from web's version:
   tech/customer-notified timeline rows (audit-trail-derived, not needed when the
   technician already knows if they were texted) and visit notes (`dispatchNotesApi`
   is confirmed current, just outside this phase's stated scope).
4. **Work order detail (tech subset)** (Part 1 done): overview (location/access
   via `customerApi.getServiceLocationById` — richer than `WorkOrder`'s own slim
   `serviceLocation`, call/directions), every work item (status pill via the
   tenant's configurable `workItemStatusesApi` + the fixed `ProgressCategory` for
   color, equipment name or the attach/no-equipment empty states, diagnosis or
   "Not yet diagnosed", existing photos grouped onto their item), and notes
   (view + add via `notesApi`, work-order-scoped — distinct from the singular
   `noteApi.ts`). Reached from Dispatch detail's new "View Work Order" button.
   Deliberately deferred to a Part 2: a full Files-tab browser (beyond the
   photo thumbnails already shown), photo/video capture + upload (needs a
   presigned-URL flow plus a camera/image-picker native dependency, neither of
   which exist yet), and the Activity feed (`activityApi` — held back partly
   because its `ActivityKind`/`ActivityCategory` enum values weren't confirmed
   in this pass). No Purchasing tab, no Estimate-tab editing, no billing.
5. **Permission-aware actions** (next up): every signed-in user can currently do
   everything the app allows — no capability checks exist anywhere in mobile. Reads
   `user.capabilities` off the existing `useCurrentUser()` and ports web's access
   logic rather than reinventing it:
   - **Dispatch status actions retrofit** (Mark en route / Mark arrived / Complete,
     shipped capability-free in Phase 3): web gates its equivalent buttons on
     `useWorkOrderAccess(workOrder).canEdit` (`apps/web/src/hooks/
     useWorkOrderAccess.ts`) — `EDIT_ALL_WORK_ORDERS`, or `EDIT_ASSIGNED_WORK_ORDERS`
     plus the dispatch being assigned to the signed-in user — not a separate
     dispatch-specific capability. Port the same `canEdit` logic as a pure function
     (mirroring how `statusTone.ts`/`dispatchLifecycleSteps.ts` ported web logic
     elsewhere) and gate those three buttons on it.
   - **On-site work order creation** (Phase 9, below): gates on `CREATE_WORK_ORDERS`,
     an existing, already-in-use capability string — no new backend work needed.
   - **Add note stays ungated**: confirmed web deliberately lets "anyone who can see
     [the work order] add one" (`apps/web/src/components/NotesCard.tsx` — only
     editing/pinning/deleting an *existing* note needs edit access), so Phase 4's
     notes feature needs no change.
   - **Open question**: whether `dispatch-api` enforces any of this server-side (a
     403 regardless of what the client checks) is unconfirmed from this repo alone —
     nothing in `packages/api/src/*.ts`'s doc comments says either way. Treat
     client-side gating here as a UX-correctness fix, not a verified security
     boundary, until that's checked against the backend.
6. **Preferred maps app**: both Directions buttons (Dispatch detail, Work order
   detail) currently hardcode a Google Maps web URL
   (`https://www.google.com/maps/search/...`), duplicated identically in
   `src/app/dispatch/[id].tsx` and `src/app/work-order/[id].tsx`. On iOS that either
   opens Safari or deep-links straight into Google Maps if it's installed — never
   Apple Maps, which annoys a tech who prefers it. Replace both call sites with one
   shared helper that:
   - Always includes the platform's built-in default with no availability check
     needed (Apple Maps `maps://` on iOS, the `geo:` intent on Android — both are
     OS-level, not third-party schemes).
   - Detects which other map apps are actually installed via `Linking.canOpenURL`
     on their own schemes (`comgooglemaps://`, `waze://`) — these **do** need
     `LSApplicationQueriesSchemes` added to `app.json`'s `ios.infoPlist`, since iOS
     restricts `canOpenURL` to whitelisted third-party schemes; unlisted schemes
     always report false regardless of whether the app is installed.
   - Asks once, only when there's an actual choice (more than one app available) —
     no prompt at all for a tech with only Apple Maps on their phone.
   - Persists the choice so it's asked once, not on every tap — same plain-value
     `AsyncStorage` pattern already used for the active-tenant-id
     (`src/tenant/tenant.ts`), not the Keychain-backed `secureTokenStorage.ts`
     (this isn't sensitive).
   - Adds a "Preferred maps app" row to Profile (`src/app/(tabs)/profile.tsx`) so
     the choice is visible and changeable later, not just set-once-and-forgotten.
   Android's exact scheme conventions (`geo:`/`google.navigation:`, `waze://`) are
   written from documented behavior, not live-tested — this project has only ever
   been run against the iOS Simulator so far.
7. **Today → "My day" rework** (done): web grew its own technician landing at `/my-day`
   (`apps/web/src/pages/MyDayPage.tsx` + `src/features/my-day/`), itself partly
   inspired by this app's Phase 2 screens. Mobile's Today tab mirrors it — **full
   parity**, decided 2026-10-21. The page answers three questions in order: what am
   I doing right now, what does the rest of the day look like, what's hanging over me.
   - **Data source switch**: from `dispatchBoardApi.getBoard({date})` + client-side
     "is this mine" filtering to `myDayApi.getDay(date?)` (`GET /scheduling/my-day`,
     already exported from the `@dispatch/api` barrel). It's purpose-built for this:
     server-side filtered to the signed-in tech, resolves "today" in the tenant's own
     timezone (the client never computes it), arrival-ordered, `driveMinFromPrev`
     precomputed, and — the semantic that matters — returns the window the tech was
     **actually sent** ("as released"), not live values that may contain unreleased
     dispatcher changes. `MyDayStop` also carries a `version` for conflict-guarded
     status writes. Phase 2's board-API correction stands; this is a further step to
     the endpoint built for exactly this view.
   - **Pure logic to port** from `myDayModel.ts` (no React/DOM, so it transfers
     directly into mobile's existing pure-helper style): `pickFocus` (first live stop,
     else first `SCHEDULED`), the `focusAction` state machine (`SCHEDULED` → "Start
     driving"/EN_ROUTE, `EN_ROUTE` → "Arrived"/IN_PROGRESS, `IN_PROGRESS` → "Complete
     visit", which hands off to the work order rather than flipping status in place),
     `isPast`/`isLive`, `routeStops`, `formatEstimate`/`formatDuration`,
     `onSiteMinutes`, `showTomorrow`, `dayName`, `swipeStep`, `DAY_RANGE = 7`. Note
     `clock()` produces the compact `"10a"` / `"10:42a"` / `"12p"` style the design
     depends on — mobile's existing `formatArrivalTime.ts` emits `"8:00 AM"`, so this
     needs a new formatter (web's algorithm is in `apps/web/src/lib/boardTime.ts`).
   - **Surfaces**: progress strip ("0 of 3 stops done · next at 10a"), focus card
     (time window, "Up next"/live pill, priority + WO tag, one primary action from
     `focusAction` plus Navigate / Call / Open WO), the route timeline with its
     connecting rail and drive-time-between-stops, the Unfinished/carryover card, the
     Tomorrow teaser, the day-done and no-stops states, and the ±7-day stepper with
     swipe.
   - **Decided**: no greeting or date line in the header (mobile's `AppHeader` already
     carries the title). Route rows link to the **work order**, matching web — not to
     Dispatch detail as they do today. Today gains the day stepper, and the Schedule
     tab **stays** (one day in depth vs. a week at a glance read differently enough to
     justify both).
   - **Genuinely new data for mobile**: the carryover queries behind the Unfinished
     card (open work orders assigned to me whose work-item status maps to the tenant's
     "pending parts" code — resolved via `workItemStatusesApi` plus web's
     `PENDING_PARTS_CODE` lookup — and quotes I sent that are still unanswered), and
     version-guarded status updates with 404 ("this changed on you") and 409
     (`DISPATCH_VERSION_CONFLICT`) handling. Mobile's `useUpdateDispatchStatus` sends
     no `version` and has no error branching, so it needs extending or replacing.
   - **Sequencing**: the focus card's status buttons need Phase 5's capability gating,
     and its Navigate button needs Phase 6's maps picker — web's own Navigate
     hardcodes a Google Maps URL, the exact behavior Phase 6 exists to fix, so don't
     copy it. Doing 5 and 6 first means this lands correct rather than needing an
     immediate retrofit.
   - **Resolved while building**: the `violet` question — mobile keeps its own
     `statusTone` (EN_ROUTE → accent) rather than adding web's violet, because every
     other status pill in the app already reads that way and a one-off colour here
     would orphan a token outside Phase 0's ported set. The `myDay.*` copy was already
     in the shared locale, so no new keys were needed. Two further departures from
     web, both deliberate: quotes in the Unfinished card are filtered to those with a
     work order (mobile has no quote screen, so the rest would be rows that go
     nowhere), and only today is actionable — other days render a read-only route.
8. **Completion**: signature + card-present payment (net-new, cross-repo).
9. **On-site work order creation**: trimmed intake, auto-assigns a dispatch to self;
   gated behind `CREATE_WORK_ORDERS` per Phase 5.
10. **Reference lookup**: customers/service-locations/equipment, read-only, no billing.
11. **Push notifications** (needs new `dispatch-api` endpoints — device tokens, events).

Profile/account (signed-in-as, sign out, workspace switcher) is **done** — folded into
Phase 1 rather than staying its own numbered phase, since it was needed there to make
the tenant gate testable end-to-end.

## Why

Technician-only feature parity was the explicit ask, scoped phase by phase rather than
guessed at — the grounding facts above came from reading the actual web app and shared
packages, not assumption. The visual direction was settled with a side-by-side mockup
before investing in real components, so the look doesn't need to change mid-build.
