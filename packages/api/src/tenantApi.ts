// Tenant API — the tenant record itself, as distinct from its settings.
//
// Two different resources with confusingly similar contents:
//   · `/tenant/tenants`  — the tenant record. Owns the BASE name, the short
//     internal one shown in the workspace switcher and picker.
//   · `/tenant-settings` — branding. Owns the customer-facing DISPLAY name used
//     on invoices, quotes and outbound email, plus the logo.
//
// "Atech" versus "Atech Incorporated, Inc". Editing one must not touch the
// other, which is why they are separate services here rather than one.
import apiClient from './client';

export interface Tenant {
  id: string;
  slug: string;
  companyName: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RenameTenantRequest {
  companyName: string;
}

export const tenantApi = {
  /**
   * Rename the caller's own workspace.
   *
   * Deliberately has no tenant id and no status field. The backend derives the
   * tenant from the request context, so a foreign workspace is not expressible;
   * and suspending a workspace drops it out of every member's picker including
   * your own, which is a platform action rather than a tenant one. Requires
   * `EDIT_SETTINGS`.
   *
   * Does not touch the slug — that is immutable, and becomes a hostname once
   * per-tenant subdomains ship.
   */
  renameCurrentWorkspace: async (request: RenameTenantRequest): Promise<Tenant> => {
    const response = await apiClient.put<Tenant>('/tenant/tenants/me', request);
    return response.data;
  },
};

export default tenantApi;
