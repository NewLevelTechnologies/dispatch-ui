import apiClient from './client';
import type { ProgressCategory } from './workOrderApi';

/**
 * `STATUS` is the work order's own lifecycle (created, completed, cancelled,
 * callback links); work item rows are `WORK_ITEM`. Quotes, invoices, payments
 * and purchase orders come from their own services' streams, not this feed.
 */
export type ActivityCategory = 'DISPATCH' | 'STATUS' | 'WORK_ITEM' | 'NOTE';

/**
 * Server-assigned split between meaningful business events and field-level
 * change/audit churn. The "Show all changes" toggle drives the request:
 * OFF → BUSINESS only, ON → ALL (BUSINESS + CHANGE).
 */
export type ActivityClassification = 'BUSINESS' | 'CHANGE';

export type ActivityKind =
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_COMPLETED'
  | 'WORK_ORDER_UPDATED'
  | 'WORK_ORDER_CANCELLED'
  | 'WORK_ORDER_ARCHIVED'
  | 'WORK_ORDER_UNARCHIVED'
  | 'WORK_ITEM_CREATED'
  | 'WORK_ITEM_UPDATED'
  | 'WORK_ITEM_STATUS_CHANGED'
  | 'WORK_ITEM_DELETED'
  | 'DISPATCH_ASSIGNED'
  | 'DISPATCH_EN_ROUTE'
  | 'DISPATCH_DEPARTED'
  | 'DISPATCH_ARRIVED'
  | 'DISPATCH_CHECKED_OUT'
  | 'DISPATCH_CANCELLED'
  | 'DISPATCH_NO_SHOW'
  | 'DISPATCH_RESCHEDULED'
  | 'DISPATCH_REASSIGNED'
  | 'FILES_UPLOADED'
  | 'NOTE_ADDED'
  | 'NOTE_DELETED'
  | 'QUOTE_SENT'
  | 'QUOTE_VIEWED'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_DECLINED'
  /** The customer browsing a proposal: one entry per stretch of clicking (`data.path`, `added`, `removed`, `totalAmount`). */
  | 'QUOTE_CHOICE_CHANGED'
  /** Below the margin floor: asked, approved, rejected (`data`: revision, note or reason, lowestMargin, floor). */
  | 'QUOTE_PRICE_APPROVAL_REQUESTED'
  | 'QUOTE_PRICE_APPROVED'
  | 'QUOTE_PRICE_REJECTED'
  /** A never-sent draft deleted; its subject no longer loads, so it renders unlinked. */
  | 'QUOTE_DELETED'
  | 'INVOICE_ISSUED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID'
  | 'INVOICE_VOIDED'
  | 'PAYMENT_RECEIVED'
  | 'PO_CREATED'
  | 'PO_STATUS_CHANGED'
  | 'CALLBACK_LINKED'
  | 'CALLBACK_UNLINKED'
  | 'CALLBACK_CHANGED';

/**
 * `SYSTEM` moves (an item advancing when a dispatch arrives) carry a null
 * `userId` and the name "System". There's no office/tech split: show the person.
 */
export interface ActivityActor {
  /** `CUSTOMER` (financial stream only): a view, or an approval on the public page with the typed name. */
  type?: 'USER' | 'SYSTEM' | 'CUSTOMER';
  userId: string | null;
  userName: string;
}

/**
 * What a row is about, as it was when written. Rows sharing `type` + `id` are
 * one thing's steps (a dispatch's assigned → arrived → checked out).
 * `number` is raw: a work item's sequence or a dispatch's trip number, so
 * format it with the glossary abbreviation. `label` is a name (the work order
 * number, a dispatch's own label), or null.
 */
export interface ActivitySubject {
  type: 'WORK_ORDER' | 'WORK_ITEM' | 'DISPATCH' | 'NOTE' | 'FILE' | 'QUOTE' | 'INVOICE' | 'PAYMENT' | 'PURCHASE_ORDER';
  id: string;
  number: number | null;
  label: string | null;
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
  /** `FINANCIAL` and `PURCHASING` rows come from their services' streams, never this feed. */
  category: ActivityCategory | 'FINANCIAL' | 'PURCHASING';
  classification?: ActivityClassification;
  timestamp: string;
  subject?: ActivitySubject | null;
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
  /** BUSINESS (default) hides field-edit churn; ALL adds CHANGE rows. */
  classification?: ActivityClassification | 'ALL';
}

/** The tenant feed also takes a scope: work orders at locations in these regions. */
export interface ListTenantActivityParams extends ListActivityParams {
  regionIds?: string[];
}

/**
 * The work order an event belongs to, denormalized onto each row of the
 * location-scoped feed. Drives the WO-collapse grouping: events sharing an
 * `id` fold into one expandable row, `activityCount` labels it ("3 updates"),
 * and `workOrderNumber`/`summary` render the group header + backlink.
 */
export interface ActivityWorkOrderRef {
  id: string;
  workOrderNumber: string;
  summary: string | null;
  progressCategory: ProgressCategory;
  /** The WO's total rows under the current category filter — the "N updates" label. */
  activityCount: number;
}

/**
 * An event in the location-scoped business stream. Same shape as the per-WO
 * feed plus the originating `workOrder` block. `workOrder` is null defensively
 * (location-scoped events not tied to a job, once those are wired).
 */
export interface LocationActivityEvent extends ActivityEvent {
  workOrder: ActivityWorkOrderRef | null;
}

export interface LocationActivityPage {
  content: LocationActivityEvent[];
  /** Opaque token. Pass back unchanged for the next page. Null on last page. */
  nextCursor: string | null;
  hasMore: boolean;
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
          classification: params?.classification,
        },
      }
    );
    return response.data;
  },

  /**
   * The work order's quote, invoice and payment steps (financial-service), in
   * the same row shape and envelope as `list`, for merging by timestamp.
   * Quote and invoice rows carry their document as `subject` (label "Q-1882");
   * a payment is a step on the invoice it paid. No category or classification
   * filter.
   */
  listFinancial: async (workOrderId: string, params?: { cursor?: string; limit?: number }): Promise<ActivityPage> => {
    const response = await apiClient.get<ActivityPage>(`/financial/work-orders/${workOrderId}/activity`, {
      params: { cursor: params?.cursor, limit: params?.limit },
    });
    return response.data;
  },

  /**
   * The work order's purchase order steps (inventory-service): created, then
   * each status change (ordered, received, cancelled with reason, reopened).
   * Same row shape and envelope as `list`; the PO is the `subject`.
   */
  listPurchasing: async (workOrderId: string, params?: { cursor?: string; limit?: number }): Promise<ActivityPage> => {
    const response = await apiClient.get<ActivityPage>(`/inventory/work-orders/${workOrderId}/activity`, {
      params: { cursor: params?.cursor, limit: params?.limit },
    });
    return response.data;
  },

  /**
   * The location-scoped business stream — every meaningful event at a site
   * across all its work orders. Same query contract as `list`; each row
   * carries a `workOrder` block for grouping + backlinks. 404 = unknown
   * location, 400 = bad cursor/category.
   */
  listForLocation: async (
    serviceLocationId: string,
    params?: ListActivityParams
  ): Promise<LocationActivityPage> => {
    const response = await apiClient.get<LocationActivityPage>(
      `/work-orders/locations/${serviceLocationId}/activity`,
      {
        params: {
          cursor: params?.cursor,
          limit: params?.limit,
          categories: params?.categories?.length ? params.categories.join(',') : undefined,
          classification: params?.classification,
        },
      }
    );
    return response.data;
  },

  /**
   * The customer-scoped work-order activity stream (ACT-1) — every meaningful
   * event across all the customer's work orders. Identical row/page shape and
   * query contract to {@link listForLocation}; the FE interleaves it with the
   * customer financial-activity stream by timestamp. 404 = unknown customer.
   */
  listForCustomer: async (
    customerId: string,
    params?: ListActivityParams
  ): Promise<LocationActivityPage> => {
    const response = await apiClient.get<LocationActivityPage>(
      `/work-orders/customers/${customerId}/activity`,
      {
        params: {
          cursor: params?.cursor,
          limit: params?.limit,
          categories: params?.categories?.length ? params.categories.join(',') : undefined,
          classification: params?.classification,
        },
      }
    );
    return response.data;
  },

  /**
   * The tenant-wide work-order activity stream (home dashboard). Identical
   * row/page shape and query contract to {@link listForLocation}; the FE
   * interleaves it with `financialActivityApi.getForTenant` by timestamp.
   */
  listForTenant: async (params?: ListTenantActivityParams): Promise<LocationActivityPage> => {
    const response = await apiClient.get<LocationActivityPage>('/work-orders/activity', {
      params: {
        cursor: params?.cursor,
        limit: params?.limit,
        categories: params?.categories?.length ? params.categories.join(',') : undefined,
        classification: params?.classification,
        regionIds: params?.regionIds?.length ? params.regionIds : undefined,
      },
    });
    return response.data;
  },
};

export default activityApi;
