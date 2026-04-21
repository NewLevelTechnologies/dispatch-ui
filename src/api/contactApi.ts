// Contact Management API Client
import apiClient from './client';
import type { AdditionalContact } from './customerApi';

export interface CreateAdditionalContactRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  displayOrder?: number;
}

export interface UpdateAdditionalContactRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  displayOrder?: number;
}

export const contactApi = {
  // Customer-level contacts
  getCustomerContacts: async (customerId: string): Promise<AdditionalContact[]> => {
    const response = await apiClient.get<AdditionalContact[]>(`/customers/${customerId}/contacts`);
    return response.data;
  },

  getCustomerContact: async (customerId: string, contactId: string): Promise<AdditionalContact> => {
    const response = await apiClient.get<AdditionalContact>(`/customers/${customerId}/contacts/${contactId}`);
    return response.data;
  },

  createCustomerContact: async (
    customerId: string,
    request: CreateAdditionalContactRequest
  ): Promise<AdditionalContact> => {
    const response = await apiClient.post<AdditionalContact>(`/customers/${customerId}/contacts`, request);
    return response.data;
  },

  updateCustomerContact: async (
    customerId: string,
    contactId: string,
    request: UpdateAdditionalContactRequest
  ): Promise<AdditionalContact> => {
    const response = await apiClient.put<AdditionalContact>(
      `/customers/${customerId}/contacts/${contactId}`,
      request
    );
    return response.data;
  },

  deleteCustomerContact: async (customerId: string, contactId: string): Promise<void> => {
    await apiClient.delete(`/customers/${customerId}/contacts/${contactId}`);
  },

  // Service Location-level contacts
  getServiceLocationContacts: async (locationId: string): Promise<AdditionalContact[]> => {
    const response = await apiClient.get<AdditionalContact[]>(`/service-locations/${locationId}/contacts`);
    return response.data;
  },

  getServiceLocationContact: async (locationId: string, contactId: string): Promise<AdditionalContact> => {
    const response = await apiClient.get<AdditionalContact>(
      `/service-locations/${locationId}/contacts/${contactId}`
    );
    return response.data;
  },

  createServiceLocationContact: async (
    locationId: string,
    request: CreateAdditionalContactRequest
  ): Promise<AdditionalContact> => {
    const response = await apiClient.post<AdditionalContact>(`/service-locations/${locationId}/contacts`, request);
    return response.data;
  },

  updateServiceLocationContact: async (
    locationId: string,
    contactId: string,
    request: UpdateAdditionalContactRequest
  ): Promise<AdditionalContact> => {
    const response = await apiClient.put<AdditionalContact>(
      `/service-locations/${locationId}/contacts/${contactId}`,
      request
    );
    return response.data;
  },

  deleteServiceLocationContact: async (locationId: string, contactId: string): Promise<void> => {
    await apiClient.delete(`/service-locations/${locationId}/contacts/${contactId}`);
  },

  // Direct contact access (for cache misses)
  getContactById: async (contactId: string): Promise<AdditionalContact> => {
    const response = await apiClient.get<AdditionalContact>(`/contacts/${contactId}`);
    return response.data;
  },
};

export default contactApi;
