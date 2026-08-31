// Contact Management API Client
import apiClient from './client';
import type { AdditionalContact } from './customerApi';

export interface CreateAdditionalContactRequest {
  name: string;
  role?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  afterHoursPhone?: string | null;
  email?: string | null;
  notes?: string | null;
  displayOrder?: number;
}

export interface UpdateAdditionalContactRequest {
  name: string;
  role?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  afterHoursPhone?: string | null;
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

  // Atomically promote a customer contact to primary; the server demotes the
  // current primary into the additional list. One call — no client-side swap.
  // Mirrors makeServiceLocationContactPrimary.
  makeCustomerContactPrimary: async (
    customerId: string,
    contactId: string
  ): Promise<AdditionalContact> => {
    const response = await apiClient.post<AdditionalContact>(
      `/customers/${customerId}/contacts/${contactId}/make-primary`
    );
    return response.data;
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

  // Atomically promote a contact to primary; the server demotes the current
  // primary into the additional list. One call — no client-side swap.
  makeServiceLocationContactPrimary: async (
    locationId: string,
    contactId: string
  ): Promise<AdditionalContact> => {
    const response = await apiClient.post<AdditionalContact>(
      `/service-locations/${locationId}/contacts/${contactId}/make-primary`
    );
    return response.data;
  },

  // Direct contact access (for cache misses)
  getContactById: async (contactId: string): Promise<AdditionalContact> => {
    const response = await apiClient.get<AdditionalContact>(`/contacts/${contactId}`);
    return response.data;
  },
};

export default contactApi;
