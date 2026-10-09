// Service Agreement API Client
//
// Recurring scheduled work ("service agreements"). Lives on work-order-service
// under /work-orders/agreements (routed via the existing /work-orders/* ALB
// rule; standard Cognito JWT, no special headers). See
// dispatch-api/handoff/FE_HANDOFF_service_agreements.md for the contract.
//
// Three layers, kept separate on purpose:
//   1. Obligation (stored, internal) — "a Q3 PM is owed at #047 in Jul 1–30".
//   2. Work order — materialized ~45d before the window; flows onto the board.
//   3. Dispatch (scheduling-service) — booking + tech; this client never touches it.
//
// Field names below are the exact wire names from the response DTOs.
import apiClient from './client';
import type { CreateNoteRequest, NoteDto, UpdateNoteRequest } from './noteApi';
import type { RecognitionBasis } from './tenantSettingsApi';
import type { Page } from './workOrderApi';

// ---- Enums (string unions matching the BE) ----------------------------------

// Only VISIT is implemented on the BE in v1; the others are reserved.
export type AgreementKind = 'VISIT' | 'SLA' | 'SHIP' | 'ON_DEMAND';
// CONTRACT = a real commercial agreement (the default list). INTERNAL =
// contractless recurrences (none created in v1).
export type AgreementClassification = 'CONTRACT' | 'INTERNAL';
// Generation + billing only run for ACTIVE agreements.
export type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
export type CadenceUnit = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export type BillingMode = 'FIXED_SCHEDULE' | 'PER_VISIT';
export type CoverageSelectorMode = 'TAG' | 'STATIC';
export type CoverageMembershipSource = 'TAG_SEEDED' | 'MANUAL' | 'AUTO_ADDED';
// Agreement/work-order-layer status only — never a booked date/tech (that's a
// dispatch concern). EXPECTED = owed, window not past, no WO yet. OVERDUE =
// owed, window closed, never materialized. SCHEDULED = a WO exists on the board.
export type AgreementVisitStatus = 'EXPECTED' | 'OVERDUE' | 'SCHEDULED' | 'COMPLETED' | 'MISSED';
// `when` filter on the visits feed.
export type AgreementVisitsWhen = 'upcoming' | 'recent';

// ---- Visit templates (the recurrence rules — 1..N per agreement) ------------

// A scope line on a visit template; becomes the generated WO's work items.
export interface VisitScopeItem {
  description: string;
  equipmentTypeId?: string | null;
  season?: string | null;
}

export interface VisitTemplateResponse {
  id: string;
  agreementId: string;
  label: string;
  cadenceUnit: CadenceUnit;
  cadenceInterval: number;
  anchorDate: string; // first occurrence (YYYY-MM-DD)
  seasonOrdinal?: number | null;
  windowDays: number; // scheduling slack from anchor (default 30)
  estDurationMinutes?: number | null;
  scopeItems: VisitScopeItem[];
  scopeVersion: number; // bumps on scope edits
  createdAt: string;
  updatedAt: string;
}

// Visit-template write bodies. `scopeItems` replaces the full list on PATCH
// when present (omit = unchanged). seasonOrdinal / estDurationMinutes are
// tri-state nullable on PATCH (omit = unchanged, null = clear).
export interface CreateVisitTemplateRequest {
  label: string;
  cadenceUnit: CadenceUnit;
  cadenceInterval?: number;
  anchorDate: string;
  seasonOrdinal?: number | null;
  windowDays?: number;
  estDurationMinutes?: number | null;
  scopeItems?: VisitScopeItem[];
}

export interface UpdateVisitTemplateRequest {
  label?: string;
  cadenceUnit?: CadenceUnit;
  cadenceInterval?: number;
  anchorDate?: string;
  seasonOrdinal?: number | null;
  windowDays?: number;
  estDurationMinutes?: number | null;
  scopeItems?: VisitScopeItem[];
}

// ---- Agreement --------------------------------------------------------------

export interface AgreementCustomerRef {
  id: string;
  name: string;
}

// Member benefits — the included terms an agreement (or plan) is sold under.
// Framed as INCLUDED TERMS, not applied discounts. `coveredPmVisits` is a COUNT
// ("2 PM visits included"); the percents are 0–100; booleans default false.
// One shape shared by plans and agreements (BE: MemberBenefitsDto).
export interface MemberBenefits {
  coveredPmVisits?: number | null;
  tripFeeWaived?: boolean;
  laborDiscountPct?: number | null;
  partsDiscountPct?: number | null;
  priorityDispatch?: boolean;
}

export interface AgreementResponse {
  id: string;
  agreementNumber: string; // human id, e.g. "SA-00042"
  tenantId: string;
  customer: AgreementCustomerRef;
  name: string;
  kind: AgreementKind;
  classification: AgreementClassification;
  status: AgreementStatus;
  termStart?: string | null;
  termEnd?: string | null;
  autoRenew: boolean;
  renewalTermMonths?: number | null;
  renewalAlertDays?: number | null;
  // A renewal booked to start at termEnd: the next term ends nextTermEnd,
  // billed at nextTermBillingAmount when set. Both null when none is booked.
  nextTermEnd?: string | null;
  nextTermBillingAmount?: number | null;
  notes?: string | null;
  // Plan provenance (null = bespoke, not sold from a plan) + the member-benefits
  // snapshot the agreement was sold under. BE always sends `benefits`; kept
  // optional here as a stale-cache safeguard (treat undefined as no benefits).
  planId?: string | null;
  benefits?: MemberBenefits;
  coverageLocationCount: number; // the "covered" number
  visitTemplates: VisitTemplateResponse[];
  createdAt: string;
  updatedAt: string;
}

// Summary row for the list endpoint (AgreementResponse minus tenantId, notes,
// renewal fields, coverageLocationCount, visitTemplates).
export interface AgreementSummaryResponse {
  id: string;
  agreementNumber: string;
  customer: AgreementCustomerRef;
  name: string;
  kind: AgreementKind;
  classification: AgreementClassification;
  status: AgreementStatus;
  termStart?: string | null;
  termEnd?: string | null;
  // The list/summary projection now serializes this (BE AGREEMENT-LIST-1),
  // matching the detail GET /work-orders/agreements/{id}. Kept OPTIONAL as a
  // deploy-window / stale-cache safeguard: consumers must treat `undefined` as
  // "unknown" (render "—"), NOT as false, so a payload that predates the BE
  // deploy never shows a misleading "No".
  autoRenew?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Company-wide list row (GET /work-orders/agreements with no customerId or
// serviceLocationId — paged). Same rules and region scope as the overview, so
// Home's counts equal the list's totalElements.
export interface AgreementListRow extends AgreementSummaryResponse {
  /** Annualized billing ÷ 12, to the cent; null unless ACTIVE with an active billing schedule. */
  monthlyValue: number | null;
  coverageLocationCount: number;
  /** Start of the next open visit window not yet closed; null when none generated (~6 months ahead). */
  nextVisitDue: string | null;
  /** Visits whose window closed unfulfilled and unwaived, all time. */
  overdueVisitCount: number;
  /** The plan it was sold from; null for a custom agreement. */
  plan: { id: string; name: string } | null;
  /** The active billing schedule: `amount` every `cadenceInterval` × `cadenceUnit`; null when none. */
  billing: AgreementListBilling | null;
  /** The covered location when coverageLocationCount is exactly 1; fields null until it syncs. */
  primaryLocation: { streetAddress: string | null; city: string | null } | null;
  /** Visits in [termStart, termEnd), waived excluded; null with no templates or an open term. */
  visitsThisTerm: { planned: number; completed: number } | null;
  /** The visit nextVisitDue names. workOrderId null = not generated yet; dispatch null = unscheduled. */
  nextVisit: AgreementNextVisit | null;
  /** termEnd when EXPIRED; the tenant-local cancel day when CANCELLED; else null. */
  endedOn: string | null;
  /** Who created it; null when unknown (older agreements). */
  createdByName: string | null;
  /** The booked renewal, as on the agreement; null when none is booked. */
  nextTermEnd?: string | null;
  nextTermBillingAmount?: number | null;
}

export interface AgreementListBilling {
  mode: BillingMode;
  /** Never null: PER_VISIT is invoiced like a fixed schedule today. */
  amount: number;
  cadenceUnit: CadenceUnit;
  cadenceInterval: number;
}

export interface AgreementNextVisit {
  windowStart: string;
  windowEnd: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  /** The earliest dispatch not yet completed (else the latest); scheduledStart = arrival window start. */
  dispatch: { scheduledStart: string; technicianName: string | null } | null;
}

/** GET /work-orders/agreements/facets — counts for the list's chips. */
export interface AgreementListFacets {
  /** Every status, under all the current filters except status. */
  statusCounts: Record<AgreementStatus, number>;
  /** Each flag on its own, under status/q/classification/plan/region. */
  renewing: number;
  renewingWithinDays: number;
  visitsBehind: number;
  noBilling: number;
}

export type AgreementListSort = 'customerName' | 'termEnd' | 'monthlyValue' | 'agreementNumber';

export interface ListAgreementsParams {
  q?: string;
  status?: AgreementStatus[];
  classification?: AgreementClassification;
  regionIds?: string[];
  /** The overview's renewing-soon rule: ACTIVE, term ending today … today + N. */
  renewingWithinDays?: number;
  /** Matched plans; OR-ed with noPlan. */
  planId?: string[];
  /** Custom agreements (no plan). */
  noPlan?: boolean;
  /** overdueVisitCount > 0. */
  visitsBehind?: boolean;
  /** ACTIVE or DRAFT with no active billing schedule. */
  noBilling?: boolean;
  /** Nulls last either way; ties by agreement number. */
  sort?: `${AgreementListSort},${'asc' | 'desc'}`;
  page?: number;
  size?: number;
}

// The visits-to-schedule queue: the overview's visitsDueSoonUnscheduled set —
// open visits on ACTIVE agreements with no live dispatch, window starting by
// today + withinDays (overdue included), oldest window first.
export interface UnscheduledVisit {
  obligationId: string;
  agreementId: string;
  agreementNumber: string;
  agreementName: string;
  customer: AgreementCustomerRef;
  /** Fields null until the location syncs; `name` null for an unnamed location. */
  serviceLocation: { id: string; name: string | null; streetAddress: string | null; city: string | null };
  visitTemplateLabel: string | null;
  windowStart: string;
  windowEnd: string;
  /**
   * MATERIALIZED with a work order to schedule; PENDING (workOrderId null)
   * means the nightly job failed to create it and will retry. Never create
   * one from the frontend.
   */
  status: 'MATERIALIZED' | 'PENDING' | string;
  workOrderId: string | null;
  workOrderNumber: string | null;
}

// Per-location PM visit status (LOC-1 Phase 3) — GET /work-orders/agreements/visit-status?customerId={id}.
// A separate work-order-service call (NOT on the customer detail payload —
// customer-service has no obligation data); the FE merges it into the locations
// table by serviceLocationId. Only locations with a PM obligation appear;
// absent → no PM (no "Visit overdue" chip). `nextVisitDue` is the next open PM
// obligation window start (next PM due), not a booked appointment.
export interface VisitStatusEntry {
  serviceLocationId: string;
  pmOverdue: boolean;
  nextVisitDue: string | null; // ISO date yyyy-MM-dd
}

// Per-customer agreement rollup (AG-1) — GET /work-orders/agreements/summary?customerId={id}.
// Scoped to the customer's ACTIVE agreements. Drives the AgreementsSummaryCard
// (ARR + coverage) and the attention strip's overdue-visit rule. One call,
// fired in parallel on the customer detail page load.
export interface CustomerAgreementSummaryResponse {
  arr: number; // annualized active billing schedules, decimal dollars
  activeAgreementCount: number;
  coveredLocations: number; // distinct, across active agreements
  totalLocations: number;
  coveragePct: number; // PERCENT 0–100, 1 decimal (NOT a 0–1 ratio)
  overdueVisitCount: number; // ATT-1
  currency: string;
}

// Tenant-wide agreement overview (home dashboard) — GET /work-orders/agreements/overview.
// Revenue, plan and renewal numbers cover ACTIVE CONTRACT agreements; visit
// numbers cover every ACTIVE agreement (internal included). Money is decimal dollars.
export interface AgreementOverviewResponse {
  asOf: string; // ISO date yyyy-MM-dd, tenant zone
  activeAgreementCount: number;
  recurringMonthly: number; // annualized active billing ÷ 12
  renewingSoon: { withinDays: number; count: number; monthlyValue: number };
  // Visits whose window starts this month (waived excluded). Remaining =
  // planned − completed − missed. Unscheduled = open with no live dispatch.
  visitsThisMonth: { planned: number; completed: number; missed: number; unscheduled: number };
  // Open visits with no live dispatch starting within `withinDays`, overdue included.
  visitsDueSoonUnscheduled: { withinDays: number; count: number };
  currency: string;
  // The regions these figures cover; null = the whole company. An agreement
  // counts only under a scope that includes every location it covers.
  regionIds: string[] | null;
}

// Create body. New agreements are created status DRAFT — generation + billing
// only run once PATCHed to ACTIVE (after coverage + visit templates are set).
// v1 only creates kind VISIT / classification CONTRACT.
export interface CreateAgreementRequest {
  customerId: string;
  name: string;
  kind?: AgreementKind;
  classification?: AgreementClassification;
  termStart?: string | null;
  termEnd?: string | null;
  autoRenew?: boolean;
  renewalTermMonths?: number | null;
  renewalAlertDays?: number | null;
  notes?: string | null;
  // Sell from a plan: set planId to record provenance. Omit `benefits` to
  // snapshot the plan's benefits; send it to override the benefits per-sale.
  planId?: string | null;
  benefits?: MemberBenefits | null;
}

export interface RenewAgreementRequest {
  termEnd: string;
  /** Reprices the billing schedule from the new term's first period; omit to keep it. */
  billingAmount?: number;
}

// PATCH body. Tri-state nullable fields (termStart, termEnd, renewalTermMonths,
// renewalAlertDays, notes) are JSON-nullable: OMIT the key to leave unchanged,
// send null to clear, send a value to set. name/status/autoRenew are plain
// optional (omit = unchanged).
export interface UpdateAgreementRequest {
  name?: string;
  status?: AgreementStatus;
  autoRenew?: boolean;
  termStart?: string | null;
  termEnd?: string | null;
  renewalTermMonths?: number | null;
  renewalAlertDays?: number | null;
  notes?: string | null;
  // Whole-object replace of the member benefits when provided; omit to leave
  // them unchanged.
  benefits?: MemberBenefits | null;
}

// ---- Coverage ---------------------------------------------------------------

export interface CoverageMembership {
  id: string;
  serviceLocationId: string;
  effectiveCoverageStart: string;
  source: CoverageMembershipSource;
  addedAt: string;
}

export interface CoverageResponse {
  agreementId: string;
  selectorMode: CoverageSelectorMode;
  selectorTagId?: string | null; // the customer-service tag when TAG mode
  autoAdd: boolean; // newly-tagged locations auto-join (PR5)
  locationCount: number;
  memberships: CoverageMembership[];
}

// Coverage write bodies.
export interface UpdateCoverageSelectorRequest {
  selectorMode: CoverageSelectorMode;
  selectorTagId?: string | null;
  autoAdd?: boolean;
}

export interface AddCoverageLocationsRequest {
  serviceLocationIds: string[];
  effectiveCoverageStart?: string;
}

// ---- Visits (obligation rows — the upcoming/recent feed) --------------------

// One obligation row. Carries a WINDOW (not an appointment) and a status.
// workOrderId is null until materialized; when set, enrich with the real
// schedule + tech from scheduling-service (dispatchesApi.listForWorkOrder).
export interface AgreementVisitResponse {
  obligationId: string;
  visitTemplateId: string;
  visitTemplateLabel: string | null; // null if the template was deleted
  serviceLocationId: string;
  periodKey: string; // e.g. "2026-Q3"
  windowStart: string;
  windowEnd: string;
  status: AgreementVisitStatus;
  workOrderId: string | null;
}

// ---- Compliance (PR3 — pending merge; 404 until deployed) -------------------

export interface AgreementComplianceSummary {
  agreementId: string;
  visitsFulfilled: number; // obligations completed
  // Obligations generated so far — reads LOW mid-term; NOT the "X / Y"
  // denominator. Use visitsExpectedThisTerm for the term total.
  visitsTotal: number;
  // The full-term expected total (the "X / Y" denominator + % base). Null for
  // open-ended agreements (no bounded term) → render X alone, no denominator.
  // For a full-year term this equals the Coverage "/yr" projection.
  visitsExpectedThisTerm: number | null;
  visitsOverdue: number; // past window, not fulfilled/waived
  visitsMissed: number; // hard-stamped missed
}

// ---- Billing schedule (agreements PR4 — merged; 404 only when none set) ------

export interface BillingScheduleResponse {
  agreementId: string;
  amount: number; // per-period installment amount (ARR = amount × periods/yr)
  cadenceUnit: CadenceUnit;
  cadenceInterval: number;
  anchorDate: string;
  netDays: number; // invoice due = period start + netDays
  billingMode: BillingMode;
  active: boolean;
}

// PUT upsert body — replaces the whole schedule (create or update). Fields map
// 1:1 to the read shape minus agreementId. `billingMode` is FIXED_SCHEDULE in
// practice (PER_VISIT exists in the enum but isn't implemented). Saving an
// active schedule starts the installment engine (mints agreement_billing_periods
// → real invoices in financial-service).
export interface UpsertBillingScheduleRequest {
  amount: number;
  cadenceUnit: CadenceUnit;
  cadenceInterval: number;
  anchorDate: string; // YYYY-MM-DD
  netDays: number;
  billingMode: BillingMode;
  active: boolean;
}

// ---- Installment schedule (the full-term billing plan) ----------------------

export type BillingInstallmentStatus = 'SCHEDULED' | 'INVOICED';

// One installment in the deterministic full-term schedule. Same cadence math the
// daily sweep uses, so it doesn't drift; `status` is INVOICED only once the
// period has actually been minted. "Paid" is NOT here — it's a financial-service
// concept; join to invoices on periodKey ⇿ invoice.billingPeriodKey.
export interface BillingInstallmentResponse {
  sequence: number; // 1-based "n of N"
  periodKey: string; // join key to invoice.billingPeriodKey
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  status: BillingInstallmentStatus;
}

// ---- Revenue recognition (billed ≠ earned) ---------------------------------
// Point-in-time computed (not stored) — safe to refetch anytime. `contractValue`
// null means no billing schedule is set (caller renders the empty state, never
// $0). Recognized accrues as visits/work orders complete; deferred is the
// unearned remainder.
export interface RevenueRecognitionResponse {
  // The basis the backend actually computed with (mirrors the tenant's
  // revenueRecognitionBasis setting). The UI anchors its labels to THIS, not
  // the setting, so the block always describes the numbers it's showing:
  // STRAIGHT_LINE → time-elapsed ("ratably over the term", no visit count);
  // PER_VISIT → "X of N work orders complete". Absent ⇒ STRAIGHT_LINE.
  basis: RecognitionBasis;
  contractValue: number | null;
  recognizedToDate: number;
  deferred: number;
  visitsFulfilled: number;
  // Term total (the "X of Y" denominator); matches /compliance's
  // visitsExpectedThisTerm so the two cards agree. Null for open-ended terms.
  visitsExpectedThisTerm: number | null;
}

// ---- Plans (tenant-defined templates a sale defaults/overrides from) --------
// Live under /work-orders/agreement-plans. A plan carries the default term,
// billing, and member benefits; selling from one pre-fills the create form and
// stamps the agreement's planId for provenance.
export interface AgreementPlanResponse {
  id: string;
  name: string;
  kind: AgreementKind;
  classification: AgreementClassification;
  defaultAmount?: number | null;
  defaultCadenceUnit?: CadenceUnit | null;
  defaultCadenceInterval: number;
  defaultNetDays: number;
  defaultBillingMode: BillingMode;
  defaultTermMonths?: number | null;
  defaultAutoRenew: boolean;
  defaultRenewalTermMonths?: number | null;
  defaultRenewalAlertDays?: number | null;
  benefits: MemberBenefits;
  active: boolean; // false = archived (DELETE archives; PATCH active:true restores)
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgreementPlanRequest {
  name: string;
  kind?: AgreementKind;
  classification?: AgreementClassification;
  defaultAmount?: number | null;
  defaultCadenceUnit?: CadenceUnit | null;
  defaultCadenceInterval?: number;
  defaultNetDays?: number;
  defaultBillingMode?: BillingMode;
  defaultTermMonths?: number | null;
  defaultAutoRenew?: boolean;
  defaultRenewalTermMonths?: number | null;
  defaultRenewalAlertDays?: number | null;
  benefits?: MemberBenefits;
}

// PATCH any field; `benefits` replaces the whole object when sent. `active`
// toggles archive/restore.
export interface UpdateAgreementPlanRequest {
  name?: string;
  kind?: AgreementKind;
  classification?: AgreementClassification;
  defaultAmount?: number | null;
  defaultCadenceUnit?: CadenceUnit | null;
  defaultCadenceInterval?: number;
  defaultNetDays?: number;
  defaultBillingMode?: BillingMode;
  defaultTermMonths?: number | null;
  defaultAutoRenew?: boolean;
  defaultRenewalTermMonths?: number | null;
  defaultRenewalAlertDays?: number | null;
  active?: boolean;
  benefits?: MemberBenefits;
}

// Spring Page envelope from GET /agreement-plans. Drive the pager off
// totalPages/totalElements/number — not content.length.
export interface AgreementPlanPage {
  content: AgreementPlanResponse[];
  totalElements: number;
  totalPages: number;
  number: number; // zero-based current page
  size: number;
}

// All optional. `active`: true = active/sellable only, false = archived only,
// OMIT = all. `sortBy` is whitelisted server-side (unknown → name). size ≤ 200.
export interface ListAgreementPlansParams {
  search?: string;
  active?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'defaultAmount';
  sortDir?: 'asc' | 'desc';
  page?: number; // zero-based
  size?: number;
}

// Lists go comma-joined; false flags and empty values are left off.
function listWireParams({ status, regionIds, planId, ...params }: ListAgreementsParams) {
  return {
    ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false)),
    ...(status?.length ? { status: status.join(',') } : {}),
    ...(planId?.length ? { planId: planId.join(',') } : {}),
    ...(regionIds?.length ? { regionIds } : {}),
  };
}

export const agreementApi = {
  // List — `classification` defaults to CONTRACT (the commercial-agreements
  // list). `customerId` scopes to one customer's Agreements tab.
  // `serviceLocationId` is the reverse lookup: agreements whose active coverage
  // includes that location (empty array when the site isn't covered).
  list: async (params?: {
    classification?: AgreementClassification;
    customerId?: string;
    serviceLocationId?: string;
  }): Promise<AgreementSummaryResponse[]> => {
    const apiParams: Record<string, string | undefined> = {
      classification: params?.classification ?? 'CONTRACT',
      customerId: params?.customerId,
      serviceLocationId: params?.serviceLocationId,
    };
    for (const key of Object.keys(apiParams)) {
      if (apiParams[key] === undefined || apiParams[key] === '') delete apiParams[key];
    }
    const response = await apiClient.get<AgreementSummaryResponse[]>('/work-orders/agreements', {
      params: apiParams,
    });
    return response.data;
  },

  // Company-wide, paged. See {@link AgreementListRow}.
  listPage: async (params: ListAgreementsParams = {}): Promise<Page<AgreementListRow>> => {
    const response = await apiClient.get<Page<AgreementListRow>>('/work-orders/agreements', {
      params: listWireParams(params),
    });
    return response.data;
  },

  // The list's chip counts, for the same filters (paging and sort ignored).
  facets: async (params: ListAgreementsParams = {}): Promise<AgreementListFacets> => {
    const response = await apiClient.get<AgreementListFacets>('/work-orders/agreements/facets', {
      params: listWireParams({ ...params, sort: undefined, page: undefined, size: undefined }),
    });
    return response.data;
  },

  // See {@link UnscheduledVisit}. withinDays defaults to 7 (Home's window).
  unscheduledVisits: async ({
    regionIds,
    ...params
  }: { withinDays?: number; regionIds?: string[]; page?: number; size?: number } = {}): Promise<
    Page<UnscheduledVisit>
  > => {
    const response = await apiClient.get<Page<UnscheduledVisit>>('/work-orders/agreements/visits/unscheduled', {
      params: { ...params, ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },

  getById: async (id: string): Promise<AgreementResponse> => {
    const response = await apiClient.get<AgreementResponse>(`/work-orders/agreements/${id}`);
    return response.data;
  },

  // Per-customer agreement rollup (AG-1). See {@link CustomerAgreementSummaryResponse}.
  getCustomerSummary: async (customerId: string): Promise<CustomerAgreementSummaryResponse> => {
    const response = await apiClient.get<CustomerAgreementSummaryResponse>(
      '/work-orders/agreements/summary',
      { params: { customerId } },
    );
    return response.data;
  },

  // Tenant-wide overview (home dashboard). See {@link AgreementOverviewResponse}.
  getOverview: async (params: { regionIds?: string[] } = {}): Promise<AgreementOverviewResponse> => {
    const response = params.regionIds?.length
      ? await apiClient.get<AgreementOverviewResponse>('/work-orders/agreements/overview', {
          params: { regionIds: params.regionIds },
        })
      : await apiClient.get<AgreementOverviewResponse>('/work-orders/agreements/overview');
    return response.data;
  },

  // Per-location PM visit status for a customer (LOC-1 Phase 3). One call;
  // merged into the locations table by serviceLocationId. See {@link VisitStatusEntry}.
  getVisitStatus: async (customerId: string): Promise<VisitStatusEntry[]> => {
    const response = await apiClient.get<VisitStatusEntry[]>(
      '/work-orders/agreements/visit-status',
      { params: { customerId } },
    );
    return response.data;
  },

  create: async (request: CreateAgreementRequest): Promise<AgreementResponse> => {
    const response = await apiClient.post<AgreementResponse>('/work-orders/agreements', request);
    return response.data;
  },

  update: async (id: string, request: UpdateAgreementRequest): Promise<AgreementResponse> => {
    const response = await apiClient.patch<AgreementResponse>(
      `/work-orders/agreements/${id}`,
      request,
    );
    return response.data;
  },

  // Sets status CANCELLED (mid-term termination).
  cancel: async (id: string): Promise<AgreementResponse> => {
    const response = await apiClient.post<AgreementResponse>(
      `/work-orders/agreements/${id}/cancel`,
    );
    return response.data;
  },

  // Renews into [termEnd, request.termEnd). Booked while the current term runs
  // (it starts at termEnd); applied now once the term has ended or from EXPIRED.
  renew: async (id: string, request: RenewAgreementRequest): Promise<AgreementResponse> => {
    const response = await apiClient.post<AgreementResponse>(
      `/work-orders/agreements/${id}/renew`,
      request,
    );
    return response.data;
  },

  // Cancels a booked renewal; the term then ends at termEnd. 409 when none is booked.
  cancelRenewal: async (id: string): Promise<AgreementResponse> => {
    const response = await apiClient.delete<AgreementResponse>(`/work-orders/agreements/${id}/renewal`);
    return response.data;
  },

  // Visit templates (1..N recurrence rules per agreement).
  createVisitTemplate: async (
    id: string,
    request: CreateVisitTemplateRequest,
  ): Promise<VisitTemplateResponse> => {
    const response = await apiClient.post<VisitTemplateResponse>(
      `/work-orders/agreements/${id}/visit-templates`,
      request,
    );
    return response.data;
  },

  updateVisitTemplate: async (
    id: string,
    templateId: string,
    request: UpdateVisitTemplateRequest,
  ): Promise<VisitTemplateResponse> => {
    const response = await apiClient.patch<VisitTemplateResponse>(
      `/work-orders/agreements/${id}/visit-templates/${templateId}`,
      request,
    );
    return response.data;
  },

  deleteVisitTemplate: async (id: string, templateId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/agreements/${id}/visit-templates/${templateId}`);
  },

  getCoverage: async (id: string): Promise<CoverageResponse> => {
    const response = await apiClient.get<CoverageResponse>(
      `/work-orders/agreements/${id}/coverage`,
    );
    return response.data;
  },

  updateCoverageSelector: async (
    id: string,
    request: UpdateCoverageSelectorRequest,
  ): Promise<CoverageResponse> => {
    const response = await apiClient.put<CoverageResponse>(
      `/work-orders/agreements/${id}/coverage/selector`,
      request,
    );
    return response.data;
  },

  // Manual coverage add (locations must belong to the agreement's customer).
  addCoverageLocations: async (
    id: string,
    request: AddCoverageLocationsRequest,
  ): Promise<CoverageResponse> => {
    const response = await apiClient.post<CoverageResponse>(
      `/work-orders/agreements/${id}/coverage/locations`,
      request,
    );
    return response.data;
  },

  removeCoverageLocation: async (id: string, serviceLocationId: string): Promise<CoverageResponse> => {
    const response = await apiClient.delete<CoverageResponse>(
      `/work-orders/agreements/${id}/coverage/locations/${serviceLocationId}`,
    );
    return response.data;
  },

  // Obligation feed. `when` defaults to upcoming (not-yet-completed, soonest
  // window first); `recent` = completed/missed, most recent first. limit ≤ 100.
  getVisits: async (
    id: string,
    params?: { when?: AgreementVisitsWhen; limit?: number },
  ): Promise<AgreementVisitResponse[]> => {
    const response = await apiClient.get<AgreementVisitResponse[]>(
      `/work-orders/agreements/${id}/visits`,
      { params: { when: params?.when ?? 'upcoming', limit: params?.limit ?? 20 } },
    );
    return response.data;
  },

  // PENDING MERGE (PR3) — expect 404 until deployed; callers degrade gracefully.
  getCompliance: async (id: string): Promise<AgreementComplianceSummary> => {
    const response = await apiClient.get<AgreementComplianceSummary>(
      `/work-orders/agreements/${id}/compliance`,
    );
    return response.data;
  },

  // 404 only when no schedule is set on the agreement (callers degrade to the
  // empty state, never an error).
  getBillingSchedule: async (id: string): Promise<BillingScheduleResponse> => {
    const response = await apiClient.get<BillingScheduleResponse>(
      `/work-orders/agreements/${id}/billing-schedule`,
    );
    return response.data;
  },

  // Create or replace the agreement's billing schedule. An active schedule
  // begins generating installment invoices on the backend's daily sweep.
  upsertBillingSchedule: async (
    id: string,
    request: UpsertBillingScheduleRequest,
  ): Promise<BillingScheduleResponse> => {
    const response = await apiClient.put<BillingScheduleResponse>(
      `/work-orders/agreements/${id}/billing-schedule`,
      request,
    );
    return response.data;
  },

  // Full-term installment schedule (ordered by date). [] = no billing set up.
  getInstallments: async (id: string): Promise<BillingInstallmentResponse[]> => {
    const response = await apiClient.get<BillingInstallmentResponse[]>(
      `/work-orders/agreements/${id}/billing-schedule/installments`,
    );
    return response.data;
  },

  // Recognized-to-date vs. deferred (point-in-time). contractValue null = no
  // billing set up.
  getRevenueRecognition: async (id: string): Promise<RevenueRecognitionResponse> => {
    const response = await apiClient.get<RevenueRecognitionResponse>(
      `/work-orders/agreements/${id}/revenue-recognition`,
    );
    return response.data;
  },
};

// ---- Plans CRUD -------------------------------------------------------------
// Tenant-defined plan templates. DELETE archives (soft); list is active-only
// unless includeInactive. Used by the plan-management settings surface and the
// sell-from-plan create flow.
export const agreementPlanApi = {
  // Paginated + searchable + sortable. Pass active:undefined to show all
  // (management table); active:true for the sell-from-plan picker. Axios drops
  // undefined params, so omitting active really omits it.
  getAll: async (params?: ListAgreementPlansParams): Promise<AgreementPlanPage> => {
    const response = await apiClient.get<AgreementPlanPage>('/work-orders/agreement-plans', { params });
    return response.data;
  },
  getById: async (id: string): Promise<AgreementPlanResponse> => {
    const response = await apiClient.get<AgreementPlanResponse>(`/work-orders/agreement-plans/${id}`);
    return response.data;
  },
  create: async (request: CreateAgreementPlanRequest): Promise<AgreementPlanResponse> => {
    const response = await apiClient.post<AgreementPlanResponse>('/work-orders/agreement-plans', request);
    return response.data;
  },
  update: async (id: string, request: UpdateAgreementPlanRequest): Promise<AgreementPlanResponse> => {
    const response = await apiClient.patch<AgreementPlanResponse>(`/work-orders/agreement-plans/${id}`, request);
    return response.data;
  },
  // Archives the plan (soft delete). Existing agreements keep their snapshot.
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-orders/agreement-plans/${id}`);
  },
};

// ---- Notes (nested under the agreement; same NoteDto shape as customer/
// location/equipment notes, so the shared NotesCard binds to it directly). ----
export const AGREEMENT_NOTE_BODY_MAX_CHARS = 4000;

export const agreementNotesApi = {
  // Pinned-first, then newest (server-ordered).
  list: async (agreementId: string): Promise<NoteDto[]> => {
    const response = await apiClient.get<NoteDto[]>(`/work-orders/agreements/${agreementId}/notes`);
    return response.data;
  },
  // Author auto-captured from the JWT — never send it from the client.
  create: async (agreementId: string, request: CreateNoteRequest): Promise<NoteDto> => {
    const response = await apiClient.post<NoteDto>(`/work-orders/agreements/${agreementId}/notes`, request);
    return response.data;
  },
  update: async (agreementId: string, noteId: string, request: UpdateNoteRequest): Promise<NoteDto> => {
    const response = await apiClient.patch<NoteDto>(
      `/work-orders/agreements/${agreementId}/notes/${noteId}`,
      request,
    );
    return response.data;
  },
  delete: async (agreementId: string, noteId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/agreements/${agreementId}/notes/${noteId}`);
  },
};

export default agreementApi;
