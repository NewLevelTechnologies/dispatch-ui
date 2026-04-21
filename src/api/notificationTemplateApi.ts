// Notification Template API Client
import apiClient from './client';

export interface NotificationTemplateVariable {
  name: string;
  description: string;
  required: boolean;
  exampleValue: string;
}

export interface NotificationTemplate {
  id: string;
  notificationTypeKey: string;
  displayName: string;
  channel: 'EMAIL' | 'SMS';
  tenantId: string | null;
  isSystemTemplate: boolean;
  subject?: string | null;
  bodyTemplate?: string | null;
  htmlBodyTemplate?: string | null;
  hasHtmlBody: boolean;
  version: number;
  isActive: boolean;
  availableVariables?: NotificationTemplateVariable[];
  createdAt?: string;
  updatedAt?: string;
  updatedByName?: string;
}

export interface NotificationTemplateListItem {
  id: string;
  notificationTypeKey: string;
  displayName: string;
  channel: 'EMAIL' | 'SMS';
  tenantId: string | null;
  isSystemTemplate: boolean;
  subject?: string | null;
  hasHtmlBody: boolean;
  version: number;
  isActive: boolean;
}

export interface CreateNotificationTemplateRequest {
  notificationTypeId: string;
  subject?: string | null;
  bodyTemplate?: string | null;
  htmlBodyTemplate?: string | null;
}

export interface UpdateNotificationTemplateRequest {
  subject?: string | null;
  bodyTemplate?: string | null;
  htmlBodyTemplate?: string | null;
}

export interface TemplatePreviewRequest {
  templateData: Record<string, string>;
}

export interface TemplatePreviewResponse {
  subject: string;
  bodyPlainText: string;
  bodyHtml?: string | null;
  missingVariables: string[];
  warnings: string[];
}

export interface ValidateTemplateRequest {
  notificationTypeId: string;
  subject?: string | null;
  bodyTemplate?: string | null;
  htmlBodyTemplate?: string | null;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidateTemplateResponse {
  valid: boolean;
  errors: string[];
  warnings: ValidationWarning[];
}

export interface TemplateVersion {
  id: string;
  version: number;
  isActive: boolean;
  subject?: string | null;
  bodyTemplate?: string | null;
  htmlBodyTemplate?: string | null;
  updatedAt: string;
  updatedByName?: string;
}

export interface TemplateVersionHistoryResponse {
  notificationTypeKey: string;
  displayName: string;
  channel: 'EMAIL' | 'SMS';
  versions: TemplateVersion[];
}

export interface NotificationTemplatesResponse {
  templates: NotificationTemplateListItem[];
}

export const notificationTemplateApi = {
  /**
   * List all notification templates
   */
  getAll: async (notificationTypeKey?: string): Promise<NotificationTemplateListItem[]> => {
    const params = notificationTypeKey ? { notificationTypeKey } : {};
    const response = await apiClient.get<NotificationTemplatesResponse>(
      '/notification-templates',
      { params }
    );
    return response.data.templates;
  },

  /**
   * Get template details by ID (includes full content and available variables)
   */
  getById: async (id: string): Promise<NotificationTemplate> => {
    const response = await apiClient.get<NotificationTemplate>(`/notification-templates/${id}`);
    return response.data;
  },

  /**
   * Create a new tenant template (override)
   */
  create: async (request: CreateNotificationTemplateRequest): Promise<NotificationTemplate> => {
    const response = await apiClient.post<NotificationTemplate>('/notification-templates', request);
    return response.data;
  },

  /**
   * Update template (creates new version)
   */
  update: async (id: string, request: UpdateNotificationTemplateRequest): Promise<NotificationTemplate> => {
    const response = await apiClient.put<NotificationTemplate>(`/notification-templates/${id}`, request);
    return response.data;
  },

  /**
   * Delete tenant template (reverts to system default)
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/notification-templates/${id}`);
  },

  /**
   * Preview template with sample data
   */
  preview: async (id: string, request: TemplatePreviewRequest): Promise<TemplatePreviewResponse> => {
    const response = await apiClient.post<TemplatePreviewResponse>(
      `/notification-templates/${id}/preview`,
      request
    );
    return response.data;
  },

  /**
   * Validate template syntax and variables
   */
  validate: async (request: ValidateTemplateRequest): Promise<ValidateTemplateResponse> => {
    const response = await apiClient.post<ValidateTemplateResponse>(
      '/notification-templates/validate',
      request
    );
    return response.data;
  },

  /**
   * Get version history for a notification type
   */
  getVersionHistory: async (notificationTypeId: string): Promise<TemplateVersionHistoryResponse> => {
    const response = await apiClient.get<TemplateVersionHistoryResponse>(
      `/notification-templates/${notificationTypeId}/history`
    );
    return response.data;
  },

  /**
   * Rollback to a previous version (creates new version with old content)
   */
  rollback: async (id: string, versionId: string): Promise<NotificationTemplate> => {
    const response = await apiClient.post<NotificationTemplate>(
      `/notification-templates/${id}/rollback/${versionId}`
    );
    return response.data;
  },
};

export default notificationTemplateApi;
