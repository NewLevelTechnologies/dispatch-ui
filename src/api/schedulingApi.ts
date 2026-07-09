// Scheduling API Client
import apiClient from './client';

// ========== DISPATCHES ==========

// NO_SHOW is a terminal outcome (tech/customer didn't show) added with the
// dispatch-board API. The FE renders it; it is not (yet) a status the UI sets.
export type DispatchStatus = 'SCHEDULED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

// Visit lifecycle — 5 nullable milestone timestamps, each null until reached.
// Returned nested on the by-id dispatch read (not the board list projection);
// drives the trip drawer's visit timeline. `arrived`/`departed` mirror the
// top-level arrivedAt/departedAt. Per FE_HANDOFF_trip_lifecycle.md.
export interface DispatchLifecycle {
  scheduled: string | null;
  notified: string | null;
  enroute: string | null;
  arrived: string | null;
  departed: string | null;
}

// Per WORK_ORDER_DETAIL_DESIGN.md / PHASE_6_FINAL_PLAN.md: dispatches commit a
// customer-facing arrival WINDOW (e.g. "Tue 8–10 AM") rather than a single
// scheduled point. The window is two timestamps; estimatedDuration is a
// separate, optional internal capacity estimate (used for utilization metrics
// and conflict detection on the dispatch board), not a customer commitment.
export interface Dispatch {
  id: string;
  workOrderId: string;
  assignedUserId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  estimatedDuration: number | null;
  status: DispatchStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Per-visit label ("Diagnosis", "Repair · WI-01") + lifecycle milestone
  // timestamps. Present on the by-id read; absent (undefined) on the board
  // list projection — render defensively.
  label?: string | null;
  lifecycle?: DispatchLifecycle | null;
  // Work items this visit addresses (cross-service ids → work-order-service).
  // Empty/absent = unscoped (the visit covers the whole work order); a populated
  // list is the specific items. Never an auto-expanded snapshot.
  addressedWorkItemIds?: string[];
}

export interface CreateDispatchRequest {
  workOrderId: string;
  assignedUserId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  estimatedDuration?: number;
  notes?: string;
  // Short caption for what the trip covers ("Diagnostic", "Install day 1").
  label?: string;
  // Opt-in SMS to the assigned technician on create. Default workflow is to
  // schedule silently and notify later from the dispatch row, so this defaults
  // to false / omitted.
  notifyAssignedUser?: boolean;
  // Work items this trip addresses; omit/empty = unscoped (covers the whole
  // work order). Drives the "Work addressed" chips.
  addressedWorkItemIds?: string[];
}

export interface UpdateDispatchRequest {
  // Reassignment mid-flight is rare but supported by the backend (e.g. tech
  // calls in sick before arrival). Editable only while SCHEDULED in the UI.
  assignedUserId?: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  estimatedDuration?: number;
  status?: DispatchStatus;
  notes?: string;
  label?: string;
  // Replace the addressed-work-item set. omit = unchanged; [] = clear (unscoped).
  addressedWorkItemIds?: string[];
}

// ---- Resolved technician view (location detail) ----
// Read-only summary that resolves "which tech matters" per work order at a
// location, plus who's physically on site right now. The backend picks one
// primary tech per WO: on-site wins → next upcoming SCHEDULED → most recent
// historical lead (DONE). `extra` is a COUNT of additional distinct techs on
// that WO, not a list — surfacing their names is a future backend follow-up.
export type TechState = 'ON_SITE' | 'SCHEDULED' | 'DONE';

export interface OnSiteTech {
  name: string | null; // null while the user-cache name resolves — render a fallback
  workOrderId: string;
  workOrderNumber: string;
  since: string; // arrived-at (ISO) — show as "on site since …"
  eta: string; // scheduled arrival window start (ISO)
}

export interface WorkOrderTech {
  name: string | null; // null → fallback (e.g. "Tech assigned"); never blank the row
  state: TechState;
  extra: number; // count of OTHER distinct techs on this WO (0 = just this one)
  live: boolean; // true only when state === 'ON_SITE'
}

export interface LocationTechSummaryResponse {
  onSiteTech: OnSiteTech | null; // null when nobody is on site right now
  techByWorkOrder: Record<string, WorkOrderTech>; // keyed by workOrderId; {} is valid
}

// ---- Dispatch board list (GET /scheduling/dispatches) ----
// Enriched row for the paged dispatch board. Superset of Dispatch: carries the
// denormalized WO / customer / location / tech display fields so the board
// renders without fan-out joins. The *Name / customer* / serviceLocation* /
// workOrder* fields are null only in the brief window before a work order or
// user has synced into scheduling's local cache — render defensively.
export interface DispatchBoardRow extends Dispatch {
  workOrderNumber: string | null;
  // Resolve the type pill (color + label) from the WO-type catalog by this id —
  // `workOrderTypeName` is published null today (latent gap), so don't rely on it.
  workOrderTypeId: string | null;
  workOrderTypeName: string | null;
  workOrderSummary: string | null; // preferred row title (see dispatchRowTitle)
  customerId: string | null;
  customerName: string | null;
  serviceLocationId: string | null;
  serviceLocationCity: string | null;
  serviceLocationState: string | null;
  assignedUserName: string | null;
}

// PageResponse<T> as returned by the board endpoint. NOTE: the page index field
// is `page` here (NOT Spring's `number` used by the generic Page<T> elsewhere) —
// this endpoint ships its own envelope, so it gets its own type.
export interface DispatchBoardPage {
  content: DispatchBoardRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export type DispatchSortField = 'arrivalWindowStart' | 'createdAt' | 'updatedAt' | 'status';

export interface ListDispatchesParams {
  assignedUserId?: string;
  workOrderId?: string;
  status?: DispatchStatus;
  from?: string; // ISO instant — arrivalWindowStart >= from (inclusive)
  to?: string; // ISO instant — arrivalWindowStart < to (exclusive)
  q?: string; // matches WO #, customer name, or tech name (NOT notes)
  page?: number; // 0-indexed
  size?: number; // default 50, capped server-side at 200
  sort?: `${DispatchSortField},${'asc' | 'desc'}`;
}

// Title precedence for a board/visit row: prefer the WO summary, fall back to
// WO number, then type name. Mirrors the location-detail dispatch-row rule.
export function dispatchRowTitle(row: DispatchBoardRow): string | null {
  return row.workOrderSummary || row.workOrderNumber || row.workOrderTypeName || null;
}

// ---- Location-scoped visit list (GET /scheduling/dispatches?serviceLocationId=) ----
// The Dispatches tab on the location detail page. SEPARATE (bespoke) mapping from
// the paged board, selected by the *presence* of the serviceLocationId param —
// drop it and the same path is the tenant-wide board with a different row
// shape and different params. Never share a query builder between the two.
//
// Params: { serviceLocationId, when, q, status, from, to, page, size }. All
// filters AND together on top of the `when` partition. No sort — ordering is
// fixed server-side by `when` (upcoming → arrival window ascending; otherwise
// newest first; sort directives are silently ignored).
//
// Field names confirmed against the real DTO (2026-06-04); filter params
// landed 2026-06-05.
export interface LocationDispatchResponse {
  id: string;
  workOrderId: string;
  assignedUserId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  estimatedDuration: number | null;
  status: DispatchStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized display fields. workOrderNumber is NON-nullable by contract:
  // a dispatch whose WO hasn't synced into scheduling's cache is omitted from
  // this list entirely, so a row always carries its number. The rest are
  // nullable until the WO / user syncs.
  workOrderNumber: string;
  // Resolve the type pill (color + label) from the WO-type catalog by this id —
  // `workOrderTypeName` is published null today (latent gap), so don't rely on it.
  workOrderTypeId: string | null;
  workOrderTypeName: string | null;
  workOrderSummary: string | null;
  assignedUserName: string | null;
}

// `when=upcoming` → STRICTLY future open visits (arrival window start ≥ now AND
// status SCHEDULED/IN_PROGRESS), soonest first. `when=past` → the exact
// complement (window already started OR a terminal status), newest first — so
// a tech on site now, or a missed still-SCHEDULED visit, is in `past`, not
// `upcoming` (live on-site state belongs to the location-tech attention
// strip). Omitted → the full listing (the union), newest first — that's what
// the tab-count badge reads.
export type LocationDispatchesWhen = 'upcoming' | 'past';

// Same PageResponse envelope as the board (`page`, not Spring's `number`),
// typed per-row-shape because the two mappings share nothing else.
export interface LocationDispatchPage {
  content: LocationDispatchResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface ListLocationDispatchesParams {
  when?: LocationDispatchesWhen;
  // Case-insensitive substring over WO number, WO summary, and assigned user
  // name. Literal %/_ are escaped server-side (unlike the board's q).
  q?: string;
  // Repeatable — pass an array for OR semantics (?status=A&status=B; the
  // shared client serializes arrays bracket-free). Case-insensitive; unknown
  // values match nothing rather than erroring. Combined with when=upcoming,
  // terminal statuses are a valid-but-always-empty request.
  status?: DispatchStatus | DispatchStatus[];
  from?: string; // ISO instant — arrivalWindowStart >= from (inclusive)
  to?: string; // ISO instant — arrivalWindowStart < to (exclusive)
  page?: number; // 0-indexed
  size?: number; // clamped 1..200 server-side
}

export const dispatchesApi = {
  // Location-scoped dispatch list (the Dispatches tab). Paged — history is unbounded
  // for a busy commercial site, so callers page it and read `totalElements`
  // for counts (never size=200-and-hope). Size is always sent explicitly; the
  // server default is not part of the contract.
  listForServiceLocation: async (
    serviceLocationId: string,
    params: ListLocationDispatchesParams = {},
  ): Promise<LocationDispatchPage> => {
    const { when, q, status, from, to, page = 0, size = 200 } = params;
    const response = await apiClient.get<LocationDispatchPage>('/scheduling/dispatches', {
      params: { serviceLocationId, when, q, status, from, to, page, size },
    });
    return response.data;
  },

  // Per-work-order visit list. Like the location mapping, the work-order-scoped
  // read on this controller returns a plain array (NOT the paged board
  // envelope) — but tolerate both so a future paging change can't break the WO
  // detail page (same defensive shim as listForServiceLocation).
  listForWorkOrder: async (workOrderId: string): Promise<DispatchBoardRow[]> => {
    const response = await apiClient.get<
      DispatchBoardRow[] | { content: DispatchBoardRow[] }
    >('/scheduling/dispatches', { params: { workOrderId } });
    const data = response.data;
    return Array.isArray(data) ? data : (data?.content ?? []);
  },

  // Paged dispatch board list. All filters AND together. Returns a
  // DispatchBoardPage envelope (breaking change from the old bare array — the
  // endpoint became paged + filterable + searchable). Callers that just want
  // rows read `.content`.
  getAll: async (params?: ListDispatchesParams): Promise<DispatchBoardPage> => {
    const response = await apiClient.get<DispatchBoardPage>('/scheduling/dispatches', { params });
    return response.data;
  },

  // Resolved technician view for a location detail page (read-only, safe to
  // fire on page load alongside the other location reads). An empty
  // techByWorkOrder ({}) means no dispatches are linked to this location's work
  // orders — not an error.
  getLocationTech: async (serviceLocationId: string): Promise<LocationTechSummaryResponse> => {
    const response = await apiClient.get<LocationTechSummaryResponse>(
      '/scheduling/dispatches/location-tech',
      { params: { serviceLocationId } },
    );
    return response.data;
  },

  getById: async (id: string): Promise<Dispatch> => {
    const response = await apiClient.get<Dispatch>(`/scheduling/dispatches/${id}`);
    return response.data;
  },

  create: async (request: CreateDispatchRequest): Promise<Dispatch> => {
    const response = await apiClient.post<Dispatch>('/scheduling/dispatches', request);
    return response.data;
  },

  update: async (id: string, request: UpdateDispatchRequest): Promise<Dispatch> => {
    const response = await apiClient.put<Dispatch>(`/scheduling/dispatches/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/scheduling/dispatches/${id}`);
  },

  // Trigger a dispatch SMS. `audience` picks who: TECH (default — the assigned
  // technician, back-compat), CUSTOMER (their arrival window, respecting the
  // customer's per-type opt-in), or BOTH. Explicit + logged, not a side effect
  // of writing the dispatch. Idempotent, so it also doubles as a resend.
  notify: async (id: string, audience?: 'TECH' | 'CUSTOMER' | 'BOTH'): Promise<void> => {
    await apiClient.post(`/scheduling/dispatches/${id}/notify`, undefined, {
      params: audience ? { audience } : undefined,
    });
  },
};

// ========== DISPATCH (VISIT) NOTES ==========
// The trip drawer's Visit-notes log — a multi-entry note collection nested
// under the dispatch (per FE_HANDOFF_dispatch_visit_notes.md). Same shape as
// the customer/location/equipment note. The server stamps author from the JWT
// (office + tech both create); NEVER send author fields. Distinct from
// `dispatch.notes` (a single string, still the CANCELLED/NO_SHOW reason).
export interface DispatchNoteResponse {
  id: string;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDispatchNoteRequest {
  body: string;
  pinned?: boolean;
}

export const dispatchNotesApi = {
  list: async (dispatchId: string): Promise<DispatchNoteResponse[]> => {
    const response = await apiClient.get<DispatchNoteResponse[]>(`/scheduling/dispatches/${dispatchId}/notes`);
    return response.data;
  },
  create: async (dispatchId: string, request: CreateDispatchNoteRequest): Promise<DispatchNoteResponse> => {
    const response = await apiClient.post<DispatchNoteResponse>(`/scheduling/dispatches/${dispatchId}/notes`, request);
    return response.data;
  },
  update: async (
    dispatchId: string,
    noteId: string,
    request: { body?: string; pinned?: boolean },
  ): Promise<DispatchNoteResponse> => {
    const response = await apiClient.patch<DispatchNoteResponse>(
      `/scheduling/dispatches/${dispatchId}/notes/${noteId}`,
      request,
    );
    return response.data;
  },
  delete: async (dispatchId: string, noteId: string): Promise<void> => {
    await apiClient.delete(`/scheduling/dispatches/${dispatchId}/notes/${noteId}`);
  },
};

// ========== AVAILABILITY ==========

export interface Availability {
  id: string;
  tenantId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAvailabilityRequest {
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  reason?: string;
  notes?: string;
}

export interface UpdateAvailabilityRequest {
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  reason?: string;
  notes?: string;
}

export const availabilityApi = {
  getAll: async (params?: {
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Availability[]> => {
    const response = await apiClient.get<Availability[]>('/scheduling/availability', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Availability> => {
    const response = await apiClient.get<Availability>(`/scheduling/availability/${id}`);
    return response.data;
  },

  create: async (request: CreateAvailabilityRequest): Promise<Availability> => {
    const response = await apiClient.post<Availability>('/scheduling/availability', request);
    return response.data;
  },

  update: async (id: string, request: UpdateAvailabilityRequest): Promise<Availability> => {
    const response = await apiClient.put<Availability>(`/scheduling/availability/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/scheduling/availability/${id}`);
  },
};

// ========== RECURRING ORDERS ==========

export interface RecurringOrder {
  id: string;
  tenantId: string;
  customerId: string;
  equipmentId?: string | null;
  frequency: string;
  nextScheduledDate: string;
  description?: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringOrderRequest {
  customerId: string;
  equipmentId?: string | null;
  frequency: string;
  nextScheduledDate: string;
  description?: string;
  notes?: string;
}

export interface UpdateRecurringOrderRequest {
  frequency?: string;
  nextScheduledDate?: string;
  description?: string;
  status?: string;
  notes?: string;
}

export const recurringOrdersApi = {
  getAll: async (params?: {
    customerId?: string;
    equipmentId?: string;
    status?: string;
    dueBefore?: string;
  }): Promise<RecurringOrder[]> => {
    const response = await apiClient.get<RecurringOrder[]>('/scheduling/recurring-orders', { params });
    return response.data;
  },

  getById: async (id: string): Promise<RecurringOrder> => {
    const response = await apiClient.get<RecurringOrder>(`/scheduling/recurring-orders/${id}`);
    return response.data;
  },

  create: async (request: CreateRecurringOrderRequest): Promise<RecurringOrder> => {
    const response = await apiClient.post<RecurringOrder>('/scheduling/recurring-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdateRecurringOrderRequest): Promise<RecurringOrder> => {
    const response = await apiClient.put<RecurringOrder>(`/scheduling/recurring-orders/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/scheduling/recurring-orders/${id}`);
  },
};

// Export combined API
export const allSchedulingApis = {
  dispatches: dispatchesApi,
  availability: availabilityApi,
  recurringOrders: recurringOrdersApi,
};

export default allSchedulingApis;
