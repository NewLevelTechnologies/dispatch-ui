// Notification Template API Client
import apiClient from './client';
import { type NotificationChannel } from './notificationApi';

// BE PR-1 adds a `scope` array per variable (which fields it's valid in) and
// renames `exampleValue` → `example`. Both are optional here during the
// transition; once BE PR-1 ships, the legacy fallbacks in templateEditor.ts
// can be removed.
export type VariableScope = 'SUBJECT' | 'BODY';

// Who a template's notifications go to: CUSTOMER-facing vs INTERNAL staff.
export type NotificationAudience = 'CUSTOMER' | 'INTERNAL';

export interface NotificationTemplateVariable {
  name: string;
  description: string;
  required: boolean;
  example?: string;
  exampleValue?: string;
  scope?: VariableScope[];
}

// PUSH is stubbed FAILED in the BE — the FE filters PUSH out of the catalog
// list. When PUSH lights up, the filter comes off. The NotificationChannel
// type itself is shared with the notification log/preference APIs.
export type { NotificationChannel } from './notificationApi';

export interface NotificationTemplate {
  id: string;
  notificationTypeKey: string;
  displayName: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
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
  channel: NotificationChannel;
  audience: NotificationAudience;
  tenantId: string | null;
  isSystemTemplate: boolean;
  subject?: string | null;
  hasHtmlBody: boolean;
  version: number;
  isActive: boolean;
  // BE PR-1 surfaces these on list items so the customized-row CellSub can
  // render "Updated …" without an N+1 detail fetch.
  updatedAt?: string;
  updatedByName?: string;
  availableVariables?: NotificationTemplateVariable[];
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
  channel: NotificationChannel;
  versions: TemplateVersion[];
}

// BE PR-2 — gated by flags.notificationSamples until it ships.
export interface TemplateSample {
  id: string;
  label: string;
  description?: string;
  data: Record<string, string>;
}

export interface TemplateSamplesResponse {
  samples: TemplateSample[];
}

// BE PR-2 — gated by flags.notificationTestSend until it ships.
export interface SendTestRequest {
  recipient: string;
  sampleId?: string;
  draft: {
    subject?: string | null;
    bodyTemplate?: string | null;
    htmlBodyTemplate?: string | null;
  };
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

  /**
   * Sample data sets for previews. BE PR-2 — gated by flags.notificationSamples.
   */
  getSamples: async (id: string): Promise<TemplateSample[]> => {
    const response = await apiClient.get<TemplateSamplesResponse>(
      `/notification-templates/${id}/samples`
    );
    return response.data.samples;
  },

  /**
   * Send a one-off test against the current draft (not the saved template).
   * BE PR-2 — gated by flags.notificationTestSend.
   */
  sendTest: async (id: string, request: SendTestRequest): Promise<void> => {
    await apiClient.post(`/notification-templates/${id}/send-test`, request);
  },
};

export default notificationTemplateApi;
