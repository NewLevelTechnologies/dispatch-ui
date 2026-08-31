import apiClient from './client';
import type { TagSummary } from './customerApi';

// Tag color enum — backend stores tag color as a fixed 8-value palette key.
export type TagColor =
  | 'NEUTRAL'
  | 'INFO'
  | 'SUCCESS'
  | 'WARNING'
  | 'DANGER'
  | 'ACCENT_1'
  | 'ACCENT_2'
  | 'ACCENT_3';

// Tenant tag list + assignment. The library endpoint lives under /customers
// because the customer service owns the resource today, but the same tags
// apply to both customers and service locations.
//
// Default list response: active tags only, sorted by name. Tenant counts are
// typically <50 (hard cap 200), so client-side filtering in pickers is fine —
// the `q` param is available for server-side typeahead if a future picker
// needs it.
//
// `color` is a fixed 8-value enum (see TagColor), not a hex string.
//
// Tags carry a `scope` so each picker shows a tight vocabulary (one shared tag
// system, scoped lists): GENERAL for customers + service locations, PAYER for
// billing-only payers. Assignment is enforced server-side (wrong scope → 400),
// so always pass the surface's scope to getAll/create. (List-row TagSummary
// stays scope-less — you don't need it to render a chip.)
export type TagScope = 'GENERAL' | 'PAYER';

export interface Tag {
  id: string;
  name: string;
  color: string;
  scope: TagScope;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagRequest {
  name: string;
  color: TagColor;
  // Defaults to GENERAL server-side if omitted, but each surface passes its own
  // scope so the GENERAL/PAYER vocabularies don't merge into one pool.
  scope?: TagScope;
}

export const tagApi = {
  getAll: async (params?: {
    q?: string;
    includeArchived?: boolean;
    // Omit to list every scope (e.g. a future tag-management screen).
    scope?: TagScope;
  }): Promise<Tag[]> => {
    const apiParams: Record<string, string | boolean | undefined> = {
      q: params?.q,
      includeArchived: params?.includeArchived || undefined,
      scope: params?.scope,
    };
    for (const key of Object.keys(apiParams)) {
      const v = apiParams[key];
      if (v === undefined || v === '') delete apiParams[key];
    }
    const response = await apiClient.get<Tag[]>('/customers/tags', { params: apiParams });
    return response.data;
  },

  // Create a tenant-level tag. Returns the new tag so callers can immediately
  // assign it (inline create-and-apply).
  create: async (request: CreateTagRequest): Promise<Tag> => {
    const response = await apiClient.post<Tag>('/customers/tags', request);
    return response.data;
  },

  // Full idempotent sync of a service location's tags — send the complete set
  // of tagIds you want; the server adds/removes to match. Returns the result.
  setForServiceLocation: async (locationId: string, tagIds: string[]): Promise<TagSummary[]> => {
    const response = await apiClient.put<TagSummary[]>(`/service-locations/${locationId}/tags`, { tagIds });
    return response.data;
  },

  // Remove a single tag assignment from a service location (does not delete
  // the tag from the tenant library).
  removeFromServiceLocation: async (locationId: string, tagId: string): Promise<void> => {
    await apiClient.delete(`/service-locations/${locationId}/tags/${tagId}`);
  },

  // Customer-level tags — same idempotent-sync contract as the service-location
  // variants (the library is shared). Tags also ride along on the customer
  // detail payload's `tags[]` for read, so this is the write path (TAG-1).
  setForCustomer: async (customerId: string, tagIds: string[]): Promise<TagSummary[]> => {
    const response = await apiClient.put<TagSummary[]>(`/customers/${customerId}/tags`, { tagIds });
    return response.data;
  },

  // Remove a single tag assignment from a customer (the tag stays in the
  // tenant library).
  removeFromCustomer: async (customerId: string, tagId: string): Promise<void> => {
    await apiClient.delete(`/customers/${customerId}/tags/${tagId}`);
  },
};

export default tagApi;
