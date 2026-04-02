// Notification Service API Client
import apiClient from './client';

// Notification Status
export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  BOUNCED: 'BOUNCED',
  FAILED: 'FAILED',
} as const;

export type NotificationStatus = typeof NotificationStatus[keyof typeof NotificationStatus];

// Notification Channel
export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
} as const;

export type NotificationChannel = typeof NotificationChannel[keyof typeof NotificationChannel];

// Types
export interface NotificationLogDto {
  id: string;
  notificationId: string;
  notificationTypeId: string;
  notificationTypeName: string;
  channel: NotificationChannel;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  status: NotificationStatus;
  entityType: string;
  entityId: string;
  subject: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
  retryCount: number;
  externalMessageId?: string;
}

export interface NotificationPreferenceDto {
  id: string;
  customerId: string;
  contactId?: string | null;
  notificationTypeId: string;
  notificationTypeKey: string;
  notificationTypeName: string;
  channel: NotificationChannel;
  optIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationPreferenceRequest {
  customerId: string;
  contactId?: string | null;
  notificationTypeId: string;
  optIn: boolean;
}

export interface UpdateNotificationPreferenceRequest {
  optIn: boolean;
}

export interface NotificationLogsQueryParams {
  customerId?: string;
  entityType?: string;
  entityId?: string;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface PageableResponse<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: {
      sorted: boolean;
      unsorted: boolean;
      empty: boolean;
    };
    offset: number;
    paged: boolean;
    unpaged: boolean;
  };
  totalPages: number;
  totalElements: number;
  last: boolean;
  size: number;
  number: number;
  sort: {
    sorted: boolean;
    unsorted: boolean;
    empty: boolean;
  };
  numberOfElements: number;
  first: boolean;
  empty: boolean;
}

// API Service
export const notificationApi = {
  // Notification Logs
  getNotificationLogs: async (
    params: NotificationLogsQueryParams = {}
  ): Promise<PageableResponse<NotificationLogDto>> => {
    const queryParams = new URLSearchParams();

    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.entityType) queryParams.append('entityType', params.entityType);
    if (params.entityId) queryParams.append('entityId', params.entityId);
    if (params.status) queryParams.append('status', params.status);
    if (params.channel) queryParams.append('channel', params.channel);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.size !== undefined) queryParams.append('size', params.size.toString());
    if (params.sort) queryParams.append('sort', params.sort);

    const response = await apiClient.get<PageableResponse<NotificationLogDto>>(
      `/notification-logs?${queryParams.toString()}`
    );
    return response.data;
  },

  getNotificationLog: async (id: string): Promise<NotificationLogDto> => {
    const response = await apiClient.get<NotificationLogDto>(`/notification-logs/${id}`);
    return response.data;
  },

  // Notification Preferences
  getCustomerPreferences: async (customerId: string): Promise<NotificationPreferenceDto[]> => {
    const response = await apiClient.get<NotificationPreferenceDto[]>(
      `/notification-preferences/customers/${customerId}`
    );
    return response.data;
  },

  getContactPreferences: async (
    customerId: string,
    contactId: string
  ): Promise<NotificationPreferenceDto[]> => {
    const response = await apiClient.get<NotificationPreferenceDto[]>(
      `/notification-preferences/customers/${customerId}/contacts/${contactId}`
    );
    return response.data;
  },

  createPreference: async (
    request: CreateNotificationPreferenceRequest
  ): Promise<NotificationPreferenceDto> => {
    const response = await apiClient.post<NotificationPreferenceDto>(
      '/notification-preferences',
      request
    );
    return response.data;
  },

  updatePreference: async (
    id: string,
    request: UpdateNotificationPreferenceRequest
  ): Promise<NotificationPreferenceDto> => {
    const response = await apiClient.put<NotificationPreferenceDto>(
      `/notification-preferences/${id}`,
      request
    );
    return response.data;
  },

  deletePreference: async (id: string): Promise<void> => {
    await apiClient.delete(`/notification-preferences/${id}`);
  },
};

export default notificationApi;
