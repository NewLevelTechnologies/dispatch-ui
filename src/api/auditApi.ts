// Audit API Client
import apiClient from './client';

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole?: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

// Known action types for the account-activity feed. The contract is
// additive — new values land in this enum over time (failed sign-ins,
// success sign-ins, attempt-collapse rows from the Cognito Lambda
// triggers). Treat the string as freeform when matching and fall back
// to a generic "Activity" rendering for anything unrecognized.
export type ActivityActionType =
  | 'USER_CREATED'
  | 'ROLE_ADDED'
  | 'ROLE_REMOVED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'PASSWORD_RESET_SENT'
  | 'MFA_RESET'
  | 'GLOBAL_SIGNOUT'
  | 'INVITATION_RESENT'
  | 'INVITATION_ACCEPTED'
  // Emitted by the Cognito post-authentication Lambda on every
  // successful sign-in. UI composes the meta line ("Chrome · macOS ·
  // 73.41.18.204") from the row's userAgent + ip fields.
  | 'SIGN_IN_SUCCESS'
  // Ships once the Cognito Lambda triggers deploy. Payload is
  // { attemptCount, windowSeconds, firstAt, lastAt }; the meta line
  // ("5 attempts · within 2 min") is composed client-side.
  | 'SIGN_IN_FAILED_RUN';

export interface ActivityActor {
  id: string;
  name: string;
}

export interface AccountActivityEvent {
  id: string;
  occurredAt: string;
  // Backend ships a closed enum today but the contract is documented as
  // additive — keep it as `string` at the type level so a newly-shipped
  // value doesn't ts-block the UI. Switch statements should default to a
  // generic glyph + "Activity" label.
  actionType: ActivityActionType | string;
  // jsonb on the backend. Only role events currently populate this with
  // { roleId, roleName }; sign-in events will add their own keys later.
  payload: Record<string, unknown> | null;
  actor: ActivityActor | null;
  ip: string | null;
  userAgent: string | null;
}

/** One field's before/after within an audit entry. Values arrive as display
 * strings; `sensitive` rows are pre-masked server-side (`••••`). A null old or
 * new value means the field was added or removed. Nested fields arrive
 * flattened with a dotted `field` and a "Parent · Child" `label`. */
export interface AuditFieldChange {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  sensitive: boolean;
}

/** A service-location audit row — a deliberate who-did-what accountability
 * record. `changes` is empty for CREATE/DELETE. Newest-first, no pagination. */
export interface ServiceLocationAuditEntry {
  id: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changes: AuditFieldChange[];
  timestamp: string;
  /**
   * True when this entry returns its field(s) to the value they held before a
   * recent same-actor edit — a toggle-and-undo that nets to no change. The
   * server detects these (cross-page and multi-field aware, within a tunable
   * window); the undone edit is `revertsEntryId`. The UI folds the pair into a
   * single "edited and reverted" row so net no-ops don't take two lines.
   */
  netNoOp?: boolean;
  /** Id of the earlier entry this one reverts. Set iff `netNoOp` is true. */
  revertsEntryId?: string | null;
}

export const auditApi = {
  /**
   * Get audit history for a specific entity
   * @param entityType - Entity type (e.g., "Customer", "WorkOrder", "Invoice")
   * @param entityId - Entity UUID
   * @returns Array of audit logs ordered by timestamp DESC
   */
  getEntityHistory: async (entityType: string, entityId: string): Promise<AuditLog[]> => {
    const response = await apiClient.get<AuditLog[]>(`/audit/${entityType}/${entityId}`);
    return response.data;
  },

  /**
   * Field-level change history for a service location, newest-first. Fetched
   * whole in one shot (no cursor) and sort-merged into the business activity
   * feed when "Show all changes" is on. Requires VIEW_AUDIT_LOGS (403 without).
   * `limit` defaults to 200 server-side, max 500.
   */
  getServiceLocationChanges: async (
    serviceLocationId: string,
    limit?: number
  ): Promise<ServiceLocationAuditEntry[]> => {
    const response = await apiClient.get<ServiceLocationAuditEntry[]>(
      `/audit/ServiceLocation/${serviceLocationId}`,
      { params: { limit } }
    );
    return response.data;
  },

  /**
   * Get audit history for a specific user
   * @param userId - User UUID
   * @returns Array of audit logs ordered by timestamp DESC
   */
  getUserHistory: async (userId: string): Promise<AuditLog[]> => {
    const response = await apiClient.get<AuditLog[]>(`/audit/user/${userId}`);
    return response.data;
  },

  /**
   * Get recent audit history across all entities (admin only)
   * @param limit - Maximum number of records to return
   * @returns Array of audit logs ordered by timestamp DESC
   */
  getRecentHistory: async (limit: number = 50): Promise<AuditLog[]> => {
    const response = await apiClient.get<AuditLog[]>(`/audit/recent`, {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get the curated account-activity feed for a user. Returns the latest
   * 20 rows newest-first; no pagination. Backend caps the page size and
   * enforces VIEW_AUDIT_LOGS; 403 surfaces if the caller lacks it.
   */
  getAccountActivity: async (userId: string): Promise<AccountActivityEvent[]> => {
    const response = await apiClient.get<AccountActivityEvent[]>(
      `/audit/account-activity/${userId}`,
    );
    return response.data;
  },

  /**
   * Tell the backend to attach IP / User-Agent to the caller's most-recent
   * SIGN_IN_SUCCESS row. Cognito post-auth ships the row with those fields
   * null because the Cognito Lambda trigger can't see the originating
   * request's IP — this endpoint reads them off the first authenticated
   * request and back-fills.
   *
   * Always returns 204 (including when there's no row to enrich), so
   * fire-and-forget is safe. Call once per sign-in, on first load after
   * the auth redirect.
   */
  enrichLatestSignIn: async (): Promise<void> => {
    await apiClient.post('/audit/sign-ins/enrich-latest');
  },
};

export default auditApi;
