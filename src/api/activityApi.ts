import apiClient from './client';

export type ActivityCategory = 'DISPATCH' | 'STATUS' | 'NOTE' | 'FINANCIAL';

export type ActivityKind =
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_UPDATED'
  | 'WORK_ORDER_CANCELLED'
  | 'WORK_ORDER_ARCHIVED'
  | 'WORK_ORDER_UNARCHIVED'
  | 'WORK_ITEM_CREATED'
  | 'WORK_ITEM_UPDATED'
  | 'WORK_ITEM_STATUS_CHANGED'
  | 'WORK_ITEM_DELETED'
  | 'DISPATCH_ASSIGNED'
  | 'DISPATCH_DEPARTED'
  | 'DISPATCH_ARRIVED'
  | 'DISPATCH_CHECKED_OUT'
  | 'DISPATCH_CANCELLED'
  | 'NOTE_ADDED'
  | 'NOTE_DELETED'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_DECLINED'
  | 'INVOICE_ISSUED'
  | 'INVOICE_PAID'
  | 'PAYMENT_RECEIVED'
  | 'PO_CREATED';

export interface ActivityActor {
  userId: string;
  userName: string;
}

/**
 * One event in the WO activity feed. `data` is per-kind structured data;
 * the OpenAPI spec documents the field shape per kind. Treat fields as
 * snapshots taken at write time (server denormalizes — names won't change
 * if entities are renamed later).
 */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  category: ActivityCategory;
  timestamp: string;
  actor: ActivityActor | null;
  data: Record<string, unknown>;
}

export interface ActivityPage {
  content: ActivityEvent[];
  /** Opaque token. Pass back unchanged for the next page. Null on last page. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListActivityParams {
  /** Opaque cursor from a previous response's `nextCursor`. Omit for first page. */
  cursor?: string;
  /** Page size. Server default 50, max 200. */
  limit?: number;
  /** Server-side filter. Empty array (or omitted) returns all categories. */
  categories?: ActivityCategory[];
}

export const activityApi = {
  list: async (workOrderId: string, params?: ListActivityParams): Promise<ActivityPage> => {
    const response = await apiClient.get<ActivityPage>(
      `/work-orders/${workOrderId}/activity`,
      {
        params: {
          cursor: params?.cursor,
          limit: params?.limit,
          categories: params?.categories?.length ? params.categories.join(',') : undefined,
        },
      }
    );
    return response.data;
  },
};

export default activityApi;
