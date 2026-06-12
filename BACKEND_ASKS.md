# Backend asks — Customer detail (MULTI) redesign

The redesigned MULTI customer detail page (`src/components/customer-detail/`) ships
now against the data the customer-detail payload + existing services already
return. The surfaces below are designed but render an **honest pending state**
("—" / "pending integration" notes) rather than fabricated values, because the
backing reads don't exist yet. Each ID is referenced from a code comment at the
point it's consumed.

The guiding principle (per the design docs): these should arrive as
**denormalized reads on the customer detail response** (or a single sibling
summary call), not as cross-service fan-out on page load.

| ID | Surface | What's needed | Where consumed |
|----|---------|---------------|----------------|
| **FIN-1** | Billing & AR card; Attention strip (AR rule) | Customer-level AR rollup: outstanding balance, aging buckets (current / 1–30 / 31–60 / 61–90 / 91+) each with amount + invoice count, plus the 91+ bucket's oldest invoice id/date. Lifetime value (LTV). Preferred payment method. | `MultiOverviewTab` → `BillingCard`, `buildAttentionItems` |
| **AG-1** | Agreements summary card | Per-customer agreement rollup so we don't fan out N `getBillingSchedule`/`getCoverage` calls: total **ARR** (Σ annualized billing schedules) and **coverage %** (covered locations ÷ total). Ideally on the agreements *list* response or a customer agreements-summary endpoint. | `MultiOverviewTab` → `AgreementsSummaryCard` |
| **LOC-1** | Locations preview + Locations tab | Per-location denorm on the customer detail payload's `serviceLocations[]`: `dispatchRegionName`, `equipmentCount`, `openJobsCount` (number), `pmOverdue`/`nextScheduledAt`, `lastServiceAt`, per-site `balance`. Today only the basic `ServiceLocation` shape is embedded, so region is resolved client-side and equipment is grouped from the customer equipment list; the operational/financial columns are omitted. Also enables the "Has open jobs" / "Visit overdue" filter chips. | `MultiOverviewTab` → `LocationsPreviewCard`; `MultiLocationsTab` |
| **ATT-1** | Attention strip | Overdue-visit count for the customer (sum across locations). Only the agreement-renewal rule fires today (derived from the agreements list's `termEnd`). | `MultiOverviewTab` → `buildAttentionItems` |
| **ID-1** | Account details card; header meta | `accountManager`, `industry`, and `lifetimeValue` on the customer detail response. Header meta currently omits the account-manager item; Account details omits Industry / LTV. | `MultiOverviewTab` → `AccountDetailsCard`; header |
| **TAG-1** | (Tags card / header tags — not yet built) | Customer-level tag assignment + read. `tagApi` only exposes service-location tag methods today; the customer detail payload has no `tags`. Tags are intentionally absent from this pass until the customer-level endpoint + `customer.tags` land. | (deferred) |
| **ACT-1** | Recent activity teaser (overview) + Activity tab | A customer-level activity feed. `activityApi.listForLocation` exists but there's no customer equivalent; the Activity tab reuses `NotificationLogsList` and the overview omits the activity teaser. | `MultiCustomerDetail` Activity tab |
| **INV-1** | Invoices tab | A customer invoices list read (`invoicesApi` is location-scoped today). The tab currently shows a "not available yet" callout. | `MultiCustomerDetail` Invoices tab |

## Notes / non-blocking

- `customer.shape` (`SINGLE`/`MULTI`/`BILLING_ONLY`) is consumed when present and
  otherwise **derived client-side** from address topology
  (`src/lib/customerShape.ts`), so the page picks the right variant whether or
  not the BE flag is deployed. No hard dependency, but server-authoritative
  `shape` is preferred long-term.
- SINGLE and BILLING_ONLY (Payer) variants are **not** in this pass — they still
  render the legacy category page. The Payer variant in particular is fully
  backend-blocked (no `/customers/payers`, no payer subtype / lifetime-paid /
  linked-jobs / linked-invoices reads) and will get its own ask list.
