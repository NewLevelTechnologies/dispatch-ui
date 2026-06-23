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
  notes?: string | null;
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
  visitsTotal: number; // non-waived obligations (the "12 of 16" denominator)
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
};

export default agreementApi;
