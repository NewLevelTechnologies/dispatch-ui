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
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
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

// ---- Billing schedule (PR4 — pending merge; 404 if none set or not deployed) -

export interface BillingScheduleResponse {
  agreementId: string;
  amount: number;
  cadenceUnit: CadenceUnit;
  cadenceInterval: number;
  anchorDate: string;
  netDays: number; // invoice due = period start + netDays
  billingMode: BillingMode;
  active: boolean;
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

  // PENDING MERGE (PR4) — 404 when not deployed OR when no schedule is set.
  getBillingSchedule: async (id: string): Promise<BillingScheduleResponse> => {
    const response = await apiClient.get<BillingScheduleResponse>(
      `/work-orders/agreements/${id}/billing-schedule`,
    );
    return response.data;
  },
};

export default agreementApi;
