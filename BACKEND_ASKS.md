# Backend asks — Customer detail (MULTI) redesign

The redesigned MULTI customer detail page (`src/components/customer-detail/`) ships
against the data the customer-detail payload + existing services return. Surfaces
still blocked on backend reads render an **honest pending state** ("—" / "pending
integration" notes) rather than fabricated values. Each ID is referenced from a
code comment at the point it's consumed.

The guiding principle (per the design docs): these should arrive as
**denormalized reads on the customer detail response** (or a single sibling
summary call), not as cross-service fan-out on page load.

**Status as of the Phase 1 wiring PR** (per `dispatch-api/handoff/FE_HANDOFF_customer_detail_multi`):
ID-1, TAG-1 and INV-1 are wired; LOC-1 is mostly wired; FIN-1 / AG-1 / ATT-1 are
Phase 2 and ACT-1 is Phase 3.

| ID | Status | Surface | What's needed | Where consumed |
|----|--------|---------|---------------|----------------|
| **ID-1** | ✅ wired | Account details card; header meta | `accountManager {id,name}` + `industry` land on the detail payload, settable via `accountManagerUserId` / `industry` on POST/PUT. LTV moved to FIN-1 (financial owns it). | `MultiOverviewTab` → `AccountDetailsCard`; header; `CustomerFormDialog` |
| **TAG-1** | ✅ wired | Header tag cluster | `customer.tags[]` on the detail payload + `GET/PUT/DELETE /customers/{id}/tags` (PUT body `{tagIds:[]}` replaces). `tagApi.setForCustomer`/`removeFromCustomer` added; `CustomerHeaderTags` mirrors the location header pattern. | `MultiCustomerDetail` header → `CustomerHeaderTags` |
| **INV-1** | ✅ wired | Invoices tab | `GET /financial/invoices?customerId=…` (filters compose) / `…/invoices/customer/{id}`. Read-only dense list: status + search + pagination. | `MultiCustomerDetail` Invoices tab → `CustomerInvoicesTab` |
| **LOC-1** | 🟢 mostly wired | Locations preview + Locations tab | Landed on `serviceLocations[]`: `dispatchRegionName`, `hasOpenJobs`, `openJobsCount`, `lastServiceAt`, per-site `balance` (+ `techOnSite`) → operational/financial columns + "Has open jobs" chip. `equipmentCount` stays FE-derived from the customer equipment list. **Still pending:** `pmOverdue` / `nextScheduledAt` (Phase 3) → "Visit overdue" chip. | `MultiOverviewTab` → `LocationsPreviewCard`; `MultiLocationsTab` |
| **FIN-1** | ✅ wired | Billing & AR card; Attention strip (AR rule) | Customer-level AR rollup via `GET /financial/customers/{id}/ar-summary`: outstanding balance, aging buckets (current / 1–30 / 31–60 / 61–90 / 91+) each with amount + invoice count, plus the 91+ bucket's oldest invoice id/date. Lifetime value (LTV). Preferred payment method. | `MultiOverviewTab` → `BillingCard`, `buildAttentionItems` |
| **AG-1** | ✅ wired | Agreements summary card | Per-customer agreement rollup via `GET /work-orders/agreements/summary?customerId={id}`: total **ARR** (Σ annualized billing schedules, server-side) + **coverage %** (covered locations ÷ total), active count. | `MultiOverviewTab` → `AgreementsSummaryCard` |
| **ATT-1** | ✅ wired | Attention strip | `overdueVisitCount` from AG-1's summary drives the overdue-visit rule; AR-91+ (FIN-1) + agreement-renewal rules also fire. | `MultiOverviewTab` → `buildAttentionItems` (now `attention.ts`) |
| **ACT-1** | ✅ wired | Activity tab | Customer-scoped WO (`/work-orders/customers/{id}/activity`) + financial (`/financial/customers/{id}/activity`) streams, both cursor-paginated, interleaved by timestamp via a merge-join frontier. `LocationActivityStream` is scope-aware (location\|customer); `CustomerActivityStream` wraps it. | `MultiCustomerDetail` Activity tab |
| **PAYER-1** | ⏳ open (BE) | Payer overview → Linked invoices / Linked jobs | A payer's invoices are for **someone else's** work, so those tables need each row to name the actual customer + service address + job: a `forCustomer` / `forLocation` / `forJob` denorm on the payer's invoice rows (`GET /financial/invoices/customer/{payerId}` currently carries `serviceLocationId` / `workOrderId` but not the resolved customer name / address). Without it the linked tables read as if the payer owns the work. FE renders an honest "pending" card until it lands. No client fan-out (resolve serviceLocationId→address per row). | `PayerDetail` → `LinkedWorkPendingCard` |
| **AGREEMENT-LIST-1** | ✅ fixed (BE) | Agreements tab → Auto-renew column | `GET /work-orders/agreements` (list/summary) now serializes `autoRenew`, matching the detail `GET /work-orders/agreements/{id}`. The FE reads it straight off the list row (no fan-out / per-row `getById`); the Auto-renew column flips from "—" to the real Yes/No once this deploys to the FE's environment. `autoRenew` is kept optional FE-side as a deploy-window / stale-cache safeguard (`undefined` → "—", never a false "No"). | `CustomerAgreementsTab` |

## Notes / non-blocking

- `customer.shape` (`SINGLE`/`MULTI`/`BILLING_ONLY`) is consumed when present and
  otherwise **derived client-side** from address topology
  (`src/lib/customerShape.ts`), so the page picks the right variant whether or
  not the BE flag is deployed. No hard dependency, but server-authoritative
  `shape` is preferred long-term.
- **All three shapes now render redesigned variants.** MULTI + SINGLE shipped;
  the Payer (BILLING_ONLY) variant (`PayerDetail`) is v1 — financial identity +
  AR (FIN-1) + working Invoices (INV-1) / Contacts / Activity (ACT-1) tabs. The
  BE confirmed Payer is mostly unblocked: `/customers/payers` exists, lifetime
  paid is FIN-1's `lifetimeValue`, linked invoices are the customer-scoped
  invoice read. **Resolved with the BE:** (a) payer **subtype DEFERRED** —
  product call; not built until there's a real classify/AR-report need (proposed
  enum: home warranty / property mgmt / warranty admin / TPA); (b) **linked-jobs
  model = billed-directly** (`invoice.customerId = payer`, `invoice.workOrderId`
  → the job) — no first-class payer→work-order link. The one open Payer ask is
  **PAYER-1** above (billed-for / performed-at denorm).
