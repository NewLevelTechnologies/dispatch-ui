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
};

export default auditApi;
