// Work Order API Client
import apiClient from './client';

export type LifecycleState = 'ACTIVE' | 'CANCELLED';

export const LifecycleState = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;

export type ProgressCategory =
  | 'NOT_STARTED'
  | 'AWAITING_SCHEDULE'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

export const ProgressCategory = {
  NOT_STARTED: 'NOT_STARTED',
  AWAITING_SCHEDULE: 'AWAITING_SCHEDULE',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const WorkOrderPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

// Inline shape matching EquipmentSummary in equipmentApi.ts. Inlined to avoid a circular
// type-import (equipmentApi imports Page<T> from this file).
export interface WorkItemEquipmentSummary {
  id: string;
  name: string;
  // Lifecycle status, projected from the equipment record so the row
  // expansion can render and edit it without a second fetch. String literal
  // mirrors equipmentApi's EquipmentStatus enum (the import is one-way to
  // avoid the circular dependency between these two API modules).
  status?: 'ACTIVE' | 'RETIRED';
  assetTag?: string | null;
  equipmentTypeName?: string | null;
  equipmentCategoryName?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  locationOnSite?: string | null;
  // Presigned URL of the profile image, if any. Short-lived (~1hr).
  profileImageUrl?: string | null;
  // Immediate parent's display name (when this equipment is itself a
  // component of another piece of equipment). Backend-denormalized.
  parentName?: string | null;
  // Direct children of this equipment, bounded by the backend (typically
  // top-N by name). Used to render sub-unit chips in the row expansion.
  // Each entry carries profileImageUrl so chips render a small thumbnail
  // for visual scan id. descendantCount carries the total even when
  // descendants is truncated.
  descendants?: Array<{ id: string; name: string; profileImageUrl?: string | null }>;
  descendantCount?: number;
  // Up to 3 most recent equipment notes (newest first) + total count.
  // Same projection shape as on EquipmentResponse; lets the WO row's
  // expansion render the inline preview without a per-row /notes fetch.
  // Inlined here to avoid a circular type import from equipmentApi.
  recentNotes?: Array<{
    id: string;
    body: string;
    authorUserId: string | null;
    authorName: string | null;
    // Mirrors EquipmentNote (pinned-first; false until the pinning migration).
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  noteCount?: number;
}

export interface WorkItemResponse {
  id: string;
  statusId: string | null;
  statusCategory: ProgressCategory;
  // The customer's complaint captured at intake.
  description: string;
  // The tech's on-site assessment — distinct from `description`. Null/blank
  // until a tech assesses (render the "Not yet diagnosed…" empty state).
  // Optional on the FE type so existing work-item mocks/projections don't
  // need backfilling; treat undefined the same as null.
  diagnosis?: string | null;
  equipmentId: string | null;
  equipment: WorkItemEquipmentSummary | null;
  createdAt: string;
  updatedAt: string;
}

// Compact projection of the work items belonging to a WorkOrderSummary —
// just description + status category, since the list views don't link
// individual work items. Backend caps at 5 entries; UI uses
// `workItemCount > workItems.length` to render a "+N more" indicator.
export interface WorkItemSummaryProjection {
  description: string;
  statusCategory: ProgressCategory;
}

// The user's best dispatch on the WO decides their state: on-site > next
// scheduled > most recent past.
export type AssignedUserState = 'ON_SITE' | 'SCHEDULED' | 'DONE';

// One distinct assigned user on a WO's dispatches, as embedded on search rows.
export interface WorkOrderAssignedUser {
  userId: string; // UUID — stable avatar/color lookup
  name: string | null; // "First Last"; null only if the user cache hasn't synced
  state: AssignedUserState;
}

// Slim shape returned by the list endpoint. Includes a capped projection
// of work items (description + statusCategory) so list surfaces can
// answer "what is this WO about" at a glance; full WorkItemResponse[] —
// with status IDs, equipment, etc. — only ships from getById().
export interface WorkOrderSummary {
  id: string;
  workOrderNumber?: string;
  customerId: string;
  serviceLocationId: string;

  // Tenant taxonomy
  workOrderTypeId?: string | null;
  divisionId?: string | null;

  // Lifecycle / progress
  lifecycleState: LifecycleState;
  progressCategory: ProgressCategory;

  // Visibility
  archivedAt?: string | null;

  // Cancellation summary (if cancelled)
  cancelledAt?: string | null;

  priority: WorkOrderPriority;
  scheduledDate?: string | null;
  completedDate?: string | null;
  customerOrderNumber?: string | null;

  // Not-to-exceed cap (currency). Backend stores as BigDecimal; serialized as
  // a JSON number. Null/absent = no cap. Backend rejects negatives.
  notToExceed?: number | null;

  // Enriched display fields. Site-contact and other extras are only populated by
  // the detail endpoint, but typed as optional here so the same shape is usable
  // on the list page without casts.
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  serviceLocation?: {
    id: string;
    customerId?: string;
    locationName?: string;
    address: {
      streetAddress: string;
      city: string;
      state: string;
      zipCode: string;
    };
    siteContactName?: string;
    siteContactPhone?: string;
    siteContactEmail?: string;
    status?: string;
  };

  // Work items projection — capped at 5 entries server-side, ordered by
  // createdAt (insertion order). `workItemCount` is the unbounded total.
  workItemCount: number;
  workItems: WorkItemSummaryProjection[];

  // Count-led equipment summary for dense list rows: `label` is precomputed by
  // the backend (the unit name when count === 1, else "N units"); `count` is 0
  // when no equipment is linked. Load-bearing on rows where the AI summary
  // doesn't name the equipment.
  equip?: { label: string; count: number } | null;

  // Distinct assigned users across the WO's non-cancelled dispatches, most-
  // relevant-first (on-site → soonest upcoming → most recent past). Always
  // present on search rows ([] = no dispatches) — render assignedUsers[0] +
  // "+N", no second fetch or merge needed. Optional on the type only because
  // detail reads share this shape.
  assignedUsers?: WorkOrderAssignedUser[];

  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder extends WorkOrderSummary {
  tenantId?: string;

  // Detail-only fields
  // Concise, glanceable job summary shown in the detail header. Nullable —
  // when absent the header falls back to the first work item's description.
  summary?: string | null;
  cancellationReason?: string | null;
  cancelledByUserId?: string | null;
  createdByUserId?: string;
  // Detail endpoint widens the inherited projection to the full
  // WorkItemResponse shape (status IDs, equipment summaries, etc.).
  // WorkItemResponse is a structural superset of WorkItemSummaryProjection,
  // so this narrows the inherited property type at the detail level.
  workItems: WorkItemResponse[];
}

// Spring Data Page<T> response wrapper
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // current page index, 0-based
  size: number;
  first?: boolean;
  last?: boolean;
}

export type WorkOrderSortField = 'scheduledDate' | 'createdAt' | 'workOrderNumber' | 'priority';
export type SortDirection = 'asc' | 'desc';

export interface CreateWorkItemRequest {
  description: string;
  statusId?: string;
  equipmentId?: string | null;
  // Tech's on-site assessment (≤5000). Usually empty at create.
  diagnosis?: string;
}

// equipmentId + diagnosis use JsonNullable semantics: omit = no change,
// null = clear, value = set.
export interface UpdateWorkItemRequest {
  description?: string;
  statusId?: string;
  equipmentId?: string | null;
  diagnosis?: string | null;
}

export interface CreateWorkOrderRequest {
  customerId: string;
  serviceLocationId: string;
  workOrderTypeId?: string;
  divisionId?: string;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  customerOrderNumber?: string;
  /** Required by the atomic-create contract — must contain at least one item. */
  workItems: CreateWorkItemRequest[];
}

// `status` is no longer updatable. Use /cancel for cancellation; progress is derived.
export interface UpdateWorkOrderRequest {
  // Reassigns the work order to a different service location. Cross-customer
  // moves are allowed — backend updates customerId implicitly to match the
  // target location's customer.
  serviceLocationId?: string;
  workOrderTypeId?: string | null;
  divisionId?: string | null;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  completedDate?: string;
  customerOrderNumber?: string;
  // JsonNullable on the backend: omit = no change, null = clear, value = set.
  notToExceed?: number | null;
}

export interface CancelWorkOrderRequest {
  reason: string;
}

export interface TransitionWorkItemStatusRequest {
  statusId: string;
  reason?: string;
}

export interface ListWorkOrdersParams {
  // Free-text search across workOrderNumber, customerOrderNumber, customer name/phone,
  // service location name/address, site contact name, and description.
  q?: string;

  // Lifecycle / progress
  lifecycleState?: LifecycleState;
  progressCategory?: ProgressCategory;

  // Tenant taxonomy. Prefer the plural form (workOrderTypeIds: string[]) — the
  // backend OR's within a filter and AND's across filters. Singulars are still
  // accepted server-side for back-compat, but if both are sent the plural wins
  // — don't pass both for the same filter.
  workOrderTypeId?: string;
  workOrderTypeIds?: string[];
  divisionId?: string;
  divisionIds?: string[];
  dispatchRegionId?: string;
  dispatchRegionIds?: string[];

  // At least one work item must be in this status (specific tenant status, not a category)
  workItemStatusId?: string;
  workItemStatusIds?: string[];

  // Customer scope
  customerId?: string;

  // Service location scope (composes with customerId)
  serviceLocationId?: string;

  // Equipment scope — returns work orders that have at least one work item
  // attached to this equipment. Powers the Service History tab on the
  // equipment detail page.
  equipmentId?: string;

  // Technician scope — single user UUID, combinable with every other filter.
  // Matches work orders having at least one non-cancelled dispatch assigned to
  // that user (completed and no-show visits count; cancelled assignments and
  // deleted dispatches never match). Reads the same table that populates
  // `technicians`, so a matching row always shows the user in its column.
  assignedUserId?: string;

  // Scheduled date range — ISO yyyy-mm-dd. From is inclusive at 00:00,
  // To is exclusive at 00:00 of the next day (handled server-side).
  scheduledDateFrom?: string;
  scheduledDateTo?: string;

  // Visibility
  includeArchived?: boolean;

  // Pagination — backend wraps the response as Page<WorkOrderSummary>.
  // page is 0-based; default size is 50 if omitted.
  page?: number;
  size?: number;

  // Sort — whitelist enforced server-side: scheduledDate, createdAt, workOrderNumber, priority
  sort?: `${WorkOrderSortField},${SortDirection}`;
}

function cleanParams(params?: ListWorkOrdersParams): Record<string, string | number | boolean | string[]> {
  if (!params) return {};
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const workOrderApi = {
  getAll: async (params?: ListWorkOrdersParams): Promise<Page<WorkOrderSummary>> => {
    const response = await apiClient.get<Page<WorkOrderSummary>>('/work-orders', { params: cleanParams(params) });
    return response.data;
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.get<WorkOrder>(`/work-orders/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string, params?: Omit<ListWorkOrdersParams, 'customerId'>): Promise<Page<WorkOrderSummary>> => {
    const response = await apiClient.get<Page<WorkOrderSummary>>('/work-orders', {
      params: cleanParams({ customerId, ...params }),
    });
    return response.data;
  },

  getByNumber: async (workOrderNumber: string): Promise<WorkOrder> => {
    // Strip "WO-" prefix if user included it
    const number = workOrderNumber.replace(/^WO-/i, '');
    const response = await apiClient.get<WorkOrder>(`/work-orders/by-number/WO-${number}`);
    return response.data;
  },

  create: async (request: CreateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>('/work-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.patch<WorkOrder>(`/work-orders/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${id}`);
  },

  cancel: async (id: string, request: CancelWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/cancel`, request);
    return response.data;
  },

  archive: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/archive`);
    return response.data;
  },

  unarchive: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/unarchive`);
    return response.data;
  },

  // ===== Work item write endpoints =====
  // Status change has its own dedicated route; create/update/delete are general edits.

  createWorkItem: async (
    workOrderId: string,
    request: CreateWorkItemRequest
  ): Promise<WorkItemResponse> => {
    const response = await apiClient.post<WorkItemResponse>(
      `/work-orders/${workOrderId}/work-items`,
      request
    );
    return response.data;
  },

  updateWorkItem: async (
    workOrderId: string,
    workItemId: string,
    request: UpdateWorkItemRequest
  ): Promise<WorkItemResponse> => {
    const response = await apiClient.patch<WorkItemResponse>(
      `/work-orders/${workOrderId}/work-items/${workItemId}`,
      request
    );
    return response.data;
  },

  deleteWorkItem: async (workOrderId: string, workItemId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${workOrderId}/work-items/${workItemId}`);
  },

  updateWorkItemStatus: async (
    workOrderId: string,
    workItemId: string,
    request: TransitionWorkItemStatusRequest
  ): Promise<WorkItemResponse> => {
    const response = await apiClient.patch<WorkItemResponse>(
      `/work-orders/${workOrderId}/work-items/${workItemId}/status`,
      request
    );
    return response.data;
  },
};

export default workOrderApi;
