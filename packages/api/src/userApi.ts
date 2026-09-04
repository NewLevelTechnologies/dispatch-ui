// User API Client
import apiClient from './client';

// Where a user sits in the invitation lifecycle. `ACTIVE` means the user
// has accepted; `INVITED` means an invitation email is outstanding;
// `INVITATION_EXPIRED` means the link aged out and a new one must be
// sent. The detail page surfaces a "Resend Invitation" action on the
// two non-active states.
export type InvitationStatus = 'INVITED' | 'INVITATION_EXPIRED' | 'ACTIVE';

export interface User {
  id: string;
  tenantId: string;
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  // Versioned CloudFront URL; cache-immutable. null when the user hasn't
  // uploaded a photo — UI falls back to an initials avatar. Optional so the
  // type stays compatible with older endpoints that don't include it yet.
  photoUrl?: string | null;
  enabled: boolean;
  invitationStatus?: InvitationStatus;
  roles?: Role[];
  capabilities?: string[];
  dispatchRegionIds?: string[];
  createdAt: string;
  updatedAt: string;
}

// Reference to a role that owns a given accent id. Used by `colorsInUse`
// maps on both the list and detail role responses. The form's color picker
// reads this to dim/disable swatches already claimed by other roles.
export interface AccentInUseRef {
  roleId: string;
  roleName: string;
}

// Map of accent id → owning role. Returned by both list and detail role
// endpoints. On the detail response, the role being edited is included; the
// FE filters it out client-side so the user can keep their existing color.
export type ColorsInUseMap = Record<string, AccentInUseRef>;

export interface Role {
  id: string;
  name: string;
  description?: string;
  // Shipped on the detail response only. List rows omit this and ship
  // `capabilityCount` instead to keep the payload bounded.
  capabilities?: string[];
  isProtected?: boolean;
  isSystemRole?: boolean;
  systemRoleCode?: string;
  // Per-row counts on the list response. Absent on the detail response.
  userCount?: number;
  capabilityCount?: number;
  // Persisted accent token id ("orange" | "amber" | "green" | "teal" | "blue"
  // | "indigo" | "violet" | "pink" | "red" | "slate"). Resolves to an oklch
  // value via `utils/roleColor.ts#roleAccent`. Optional because cloned roles
  // may ship with `null` until the admin picks a color on the edit page.
  accentId?: string | null;
  // Flags roles whose holders perform field work. Consumed by dispatch-board
  // pickers and work-order assignment lists (wired in a follow-up PR).
  performsFieldWork?: boolean;
  // Present on the detail response (`GET /users/roles/{id}`). Absent on
  // list-response role entries — fetch the list separately to get its map.
  colorsInUse?: ColorsInUseMap;
  createdAt?: string;
  updatedAt?: string;
}

// Roles list response (`GET /users/roles`) — wrapped now that the BE ships
// `totals` and `colorsInUse` alongside the roles array. Older call sites
// that only need the array call `userApi.getRoles()` which unwraps.
export interface RolesListResponse {
  roles: Role[];
  totals?: {
    // Distinct users with ≥1 role (not the sum of per-role userCounts —
    // that would double-count users assigned to multiple roles).
    usersAssigned?: number;
    // Size of the platform Capability catalog — denominator for "X of Y
    // granted" on the per-row capability chart.
    totalCapabilities?: number;
    // Number of system roles where isModifiedFromDefault is true. Drives
    // the enabled state of the "Restore all defaults" button.
    builtinModifiedCount?: number;
  };
  colorsInUse?: ColorsInUseMap;
}

export interface Capability {
  name: string;
  displayName: string;
  description: string;
}

export interface CapabilityGroup {
  featureArea: string;
  displayName: string;
  capabilities: Capability[];
}

export interface GroupedCapabilitiesResponse {
  groups: CapabilityGroup[];
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  roleIds: string[];
  dispatchRegionIds?: string[];
  phoneNumber?: string | null;
  sendInvite?: boolean;
}

export interface UpdateUserProfileRequest {
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
}

export interface UpdateUserRolesRequest {
  roleIds: string[];
}

export interface UpdateUserRegionsRequest {
  dispatchRegionIds: string[];
}

export interface UpdateUserEnabledRequest {
  enabled: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  capabilities: string[];
  accentId?: string;
  performsFieldWork?: boolean;
}

export interface UpdateRoleRequest {
  name: string;
  description?: string;
  accentId?: string;
  performsFieldWork?: boolean;
}

export interface UpdateRoleCapabilitiesRequest {
  capabilities: string[];
}

export interface RestoreAllDefaultsResponse {
  restoredRoles: Role[];
  recreatedRoles: Role[];
  preservedCustomRoles: Role[];
}

// Members of a role — surfaces on the role detail page Members card.
// `roles` is the user's full role list (slim id+name refs). The FE derives
// the sub-line "title" string from this list per the role detail page.
export interface RoleMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl?: string | null;
  roles: { id: string; name: string }[];
}

// Spring-style page envelope. `counts` is populated on `/users` (paged user
// search) so the list-page subtitle can show "X disabled · Y invited"
// without a second query; it's null on role-members and other paged
// endpoints that don't compute aggregates.
export interface PageEnvelope<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  counts?: UserPageCounts | null;
}

// Lightweight user shape returned by GET /users/assignable — the account-manager
// picker only needs id/name/email.
export interface AssignableUser {
  id: string;
  // /users/assignable returns the full UserResponse — the display name is
  // firstName + lastName (both required on a user), NOT a combined `name` field.
  firstName: string;
  lastName: string;
  email: string;
}

export interface UserPageCounts {
  disabled: number;
  // INVITED + INVITATION_EXPIRED combined — what the subtitle pill needs.
  invited: number;
}

// Params for `GET /users`. All optional. `roleId` and `invitationStatus`
// serialize as repeated keys on the wire (`?roleId=a&roleId=b`).
//
// `sort` accepts Spring's `field,dir` form, e.g. `lastName,asc`. Unknown
// sort fields fall back to `lastName,asc` server-side, no 400. Allowed
// fields: lastName, firstName, email, createdAt, status, enabled.
export interface UserSearchParams {
  q?: string;
  enabled?: boolean;
  invitationStatus?: InvitationStatus[];
  roleId?: string[];
  page?: number;
  size?: number;
  sort?: string;
}

// Params for `GET /users/roles/{id}/members`. Allowed sort fields here are
// narrower than on `/users`: lastName, firstName, email.
export interface RoleMemberSearchParams {
  q?: string;
  page?: number;
  size?: number;
  sort?: string;
}

// Admin-facing 2FA status for the User Detail Security card. Mirrors the
// shape of Amplify's fetchMFAPreference (self-user) so the rendering code
// can be reused. Pulled on demand — the BE pays the Cognito call only
// when this endpoint is hit.
export interface TwoFactorStatus {
  enabled: ('TOTP' | 'SMS' | 'EMAIL')[];
  preferred: 'TOTP' | 'SMS' | 'EMAIL' | null;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  userId: string;
  changes: Record<string, string>;
  timestamp: string;
}

/**
 * One workspace the signed-in person may act in.
 *
 * `userId` is the membership id (`tenant_users.id`) and **differs per tenant**.
 * It is what `/users/me` returns once a tenant is selected, and what every
 * service's audit trail and "assigned to" references point at — so it must
 * never be cached across a workspace switch, and an id from one workspace means
 * nothing in another.
 *
 * `tenantSlug` is the only tenant identifier ever shown to a user: it
 * disambiguates same-named companies, and becomes the hostname label once
 * per-tenant subdomains ship. `tenantId` is never rendered.
 *
 * `companyName` is the tenant's BASE name — the short internal one shown in the
 * switcher and picker. It is deliberately not `TenantSettings.companyName`,
 * which is the customer-facing display name on invoices and outbound email
 * ("Atech" vs "Atech Incorporated, Inc").
 *
 * `logoUrl` is the 128px rendition, read live from the shared tenant-settings
 * cache rather than mirrored into the membership registry. Null means "render
 * the monogram" — either the tenant has no logo, or its branding is not
 * currently cached. Never an error.
 */
export interface TenantMembership {
  tenantId: string;
  tenantSlug: string;
  companyName: string;
  userId: string;
  logoUrl?: string | null;
}

export interface MembershipListResponse {
  memberships: TenantMembership[];
}

export const userApi = {
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },

  // The workspaces this person may act in. Runs BEFORE a tenant is chosen and
  // is the one call that goes out without `X-Tenant-Id` (see the tenant-optional
  // list in client.ts).
  //
  // An empty array is a valid 200, not an error: every membership may be
  // disabled, removed, or in a suspended tenant. Ordered by company name, and
  // deliberately kept in that order — see `listMyTenants` callers.
  listMyTenants: async (): Promise<TenantMembership[]> => {
    const response = await apiClient.get<MembershipListResponse>('/users/me/tenants');
    return response.data.memberships;
  },

  // Paged user search. The wire format takes repeated keys for
  // multi-value params (`?roleId=a&roleId=b`); axios's `paramsSerializer`
  // for arrays produces `roleId[]=a` by default, so build a URLSearchParams
  // explicitly to keep the shape Spring expects.
  searchUsers: async (params: UserSearchParams = {}): Promise<PageEnvelope<User>> => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (typeof params.enabled === 'boolean') sp.set('enabled', String(params.enabled));
    params.invitationStatus?.forEach((s) => sp.append('invitationStatus', s));
    params.roleId?.forEach((id) => sp.append('roleId', id));
    if (typeof params.page === 'number') sp.set('page', String(params.page));
    if (typeof params.size === 'number') sp.set('size', String(params.size));
    if (params.sort) sp.set('sort', params.sort);
    const qs = sp.toString();
    const response = await apiClient.get<PageEnvelope<User>>(
      `/users${qs ? `?${qs}` : ''}`
    );
    return response.data;
  },

  // Legacy flat-array reader for picker call sites (dispatch assignment,
  // technician dropdowns). Returns the first page (capped at the server's
  // max of 100) — fine for current tenant sizes, but flag it before adding
  // a new caller. Long-term these pickers should fetch role-filtered,
  // server-paged results directly via `searchUsers`.
  getAll: async (): Promise<User[]> => {
    const page = await userApi.searchUsers({ size: 100 });
    return page.content;
  },

  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  // Account-manager picker source. Server-side name/email typeahead, gated by
  // VIEW_CUSTOMERS (not VIEW_USERS) so customer editors can assign without
  // user-admin rights. Returns all enabled users (no eligibility model yet).
  // Use this for the AccountManagerPicker — NOT getAll(), which caps at 100.
  getAssignable: async (q: string): Promise<PageEnvelope<AssignableUser>> => {
    const response = await apiClient.get<PageEnvelope<AssignableUser>>('/users/assignable', {
      params: { q: q || undefined, size: 20 },
    });
    return response.data;
  },

  // Flat-array convenience reader for callers that only need the role list
  // (UsersPage, RoleFormPage's Start-from chips, UserFormPage). Unwraps the
  // new envelope. Use `listRoles()` instead when you also need `colorsInUse`
  // or `totals`.
  getRoles: async (): Promise<Role[]> => {
    const response = await apiClient.get<RolesListResponse | Role[]>('/users/roles');
    // BE shipped the wrapped shape, but tolerate the legacy flat array in
    // case a deployment lag puts us on an older server briefly.
    if (Array.isArray(response.data)) return response.data;
    return response.data.roles ?? [];
  },

  // Full envelope for callers that need `colorsInUse` (RoleFormPage color
  // picker in add mode) or future `totals` (RolesPage summary strip).
  listRoles: async (): Promise<RolesListResponse> => {
    const response = await apiClient.get<RolesListResponse | Role[]>('/users/roles');
    if (Array.isArray(response.data)) return { roles: response.data };
    return response.data;
  },

  getGroupedCapabilities: async (): Promise<GroupedCapabilitiesResponse> => {
    const response = await apiClient.get<GroupedCapabilitiesResponse>('/users/capabilities/grouped');
    return response.data;
  },

  create: async (request: CreateUserRequest): Promise<User> => {
    const response = await apiClient.post<User>('/users', request);
    return response.data;
  },

  updateProfile: async (id: string, request: UpdateUserProfileRequest): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, request);
    return response.data;
  },

  // Self-service variants. /users/me derives the user from the JWT
  // server-side, so call sites don't need to thread the current user id
  // through. Returns the full updated User — swap directly into cache.
  updateMyProfile: async (request: UpdateUserProfileRequest): Promise<User> => {
    const response = await apiClient.put<User>('/users/me', request);
    return response.data;
  },

  uploadMyPhoto: async (file: File): Promise<User> => {
    const form = new FormData();
    form.append('file', file);
    const response = await apiClient.post<User>('/users/me/photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteMyPhoto: async (): Promise<User> => {
    const response = await apiClient.delete<User>('/users/me/photo');
    return response.data;
  },

  updateRoles: async (id: string, request: UpdateUserRolesRequest): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}/roles`, request);
    return response.data;
  },

  updateRegions: async (id: string, request: UpdateUserRegionsRequest): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}/dispatch-regions`, request);
    return response.data;
  },

  // Backend dropped the `enabled` field from PUT /users/{id} — sending it
  // is silently ignored now. Activation/deactivation goes through the
  // dedicated POST endpoints, which also emit the matching activity-feed
  // events (USER_ACTIVATED / USER_DEACTIVATED + cascade GLOBAL_SIGNOUT).
  // The original method names are preserved so call sites stay the same.
  enable: async (id: string): Promise<User> => {
    const response = await apiClient.post<User>(`/users/${id}/activate`);
    return response.data;
  },

  disable: async (id: string): Promise<User> => {
    const response = await apiClient.post<User>(`/users/${id}/deactivate`);
    return response.data;
  },

  // Admin Security-card actions. Each returns 204 on success.
  sendPasswordResetLink: async (id: string): Promise<void> => {
    await apiClient.post(`/users/${id}/reset-password`);
  },

  resetMfa: async (id: string): Promise<void> => {
    await apiClient.post(`/users/${id}/mfa-reset`);
  },

  get2faStatus: async (id: string): Promise<TwoFactorStatus> => {
    const response = await apiClient.get<TwoFactorStatus>(`/users/${id}/2fa/status`);
    return response.data;
  },

  signOutEverywhere: async (id: string): Promise<void> => {
    await apiClient.post(`/users/${id}/sign-out`);
  },

  // Returns 409 if the user is past the invitation state — caller should
  // surface that distinctly from a transient failure.
  resendInvitation: async (id: string): Promise<void> => {
    await apiClient.post(`/users/${id}/invitation/resend`);
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  // Role management methods
  getRoleById: async (id: string): Promise<Role> => {
    const response = await apiClient.get<Role>(`/users/roles/${id}`);
    return response.data;
  },

  createRole: async (request: CreateRoleRequest): Promise<Role> => {
    const response = await apiClient.post<Role>('/users/roles', request);
    return response.data;
  },

  updateRole: async (id: string, request: UpdateRoleRequest): Promise<Role> => {
    const response = await apiClient.put<Role>(`/users/roles/${id}`, request);
    return response.data;
  },

  updateRoleCapabilities: async (id: string, request: UpdateRoleCapabilitiesRequest): Promise<Role> => {
    const response = await apiClient.put<Role>(`/users/roles/${id}/capabilities`, request);
    return response.data;
  },

  deleteRole: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/roles/${id}`);
  },

  cloneRole: async (id: string, request: { name: string; description?: string }): Promise<Role> => {
    const response = await apiClient.post<Role>(`/users/roles/${id}/clone`, request);
    return response.data;
  },

  restoreRoleDefaults: async (id: string): Promise<Role> => {
    const response = await apiClient.post<Role>(`/users/roles/${id}/restore-defaults`);
    return response.data;
  },

  restoreAllDefaults: async (): Promise<RestoreAllDefaultsResponse> => {
    const response = await apiClient.post<RestoreAllDefaultsResponse>('/users/roles/restore-all-defaults');
    return response.data;
  },

  // Paged role-members search. Backend response is `PageEnvelope<RoleMember>`
  // (was `{ users: [...] }` pre-migration). Default sort `lastName,asc`;
  // allowed sort fields: lastName, firstName, email. `counts` is null here.
  listRoleMembers: async (
    id: string,
    params: RoleMemberSearchParams = {}
  ): Promise<PageEnvelope<RoleMember>> => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (typeof params.page === 'number') sp.set('page', String(params.page));
    if (typeof params.size === 'number') sp.set('size', String(params.size));
    if (params.sort) sp.set('sort', params.sort);
    const qs = sp.toString();
    const response = await apiClient.get<PageEnvelope<RoleMember>>(
      `/users/roles/${id}/members${qs ? `?${qs}` : ''}`
    );
    return response.data;
  },

  // Audit log
  getAuditLog: async (userId: string): Promise<AuditLogEntry[]> => {
    const response = await apiClient.get<AuditLogEntry[]>(`/audit/user/${userId}`);
    return response.data;
  },
};

export default userApi;
