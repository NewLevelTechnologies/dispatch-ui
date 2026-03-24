// Customer API Client
import apiClient from './client';

export interface Address {
  streetAddress: string;
  streetAddressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  validated?: boolean;
  validatedAt?: string | null;
  dpvConfirmation?: string | null;
  isBusiness?: boolean;
}

export interface ServiceLocation {
  id: string;
  customerId: string;
  locationName?: string | null;
  address: Address;
  previousLocationId?: string | null;
  successionDate?: string | null;
  successionType?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type CustomerDisplayMode = 'SIMPLE' | 'STANDARD';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  billingAddress: Address;
  serviceLocations: ServiceLocation[];
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier?: string | null;
  taxExempt: boolean;
  taxExemptCertificate?: string | null;
  notes?: string | null;
  status: CustomerStatus;
  displayMode: CustomerDisplayMode;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateServiceLocationRequest {
  locationName?: string | null;
  address: {
    streetAddress: string;
    streetAddressLine2?: string | null;
    city: string;
    state: string;
    zipCode: string;
  };
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
}

export interface CreateCustomerRequest {
  name: string;
  email: string;
  phone?: string | null;
  billingAddress: {
    streetAddress: string;
    streetAddressLine2?: string | null;
    city: string;
    state: string;
    zipCode: string;
  };
  serviceLocations: CreateServiceLocationRequest[];
  billingAddressSameAsService?: boolean;
  paymentTermsDays?: number;
  requiresPurchaseOrder?: boolean;
  contractPricingTier?: string | null;
  taxExempt?: boolean;
  taxExemptCertificate?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerRequest {
  name: string;
  email: string;
  phone?: string | null;
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier?: string | null;
  taxExempt: boolean;
  taxExemptCertificate?: string | null;
  notes?: string | null;
  status: CustomerStatus;
}

export interface UpdateBillingAddressRequest {
  billingAddress: {
    streetAddress: string;
    streetAddressLine2?: string | null;
    city: string;
    state: string;
    zipCode: string;
  };
}

export interface UpdateServiceLocationRequest {
  locationName?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

export interface UpdateServiceLocationAddressRequest {
  streetAddress: string;
  streetAddressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export const customerApi = {
  getAll: async (): Promise<Customer[]> => {
    const response = await apiClient.get<Customer[]>('/customers');
    return response.data;
  },

  getById: async (id: string): Promise<Customer> => {
    const response = await apiClient.get<Customer>(`/customers/${id}`);
    return response.data;
  },

  create: async (request: CreateCustomerRequest): Promise<Customer> => {
    const response = await apiClient.post<Customer>('/customers', request);
    return response.data;
  },

  update: async (id: string, request: UpdateCustomerRequest): Promise<Customer> => {
    const response = await apiClient.put<Customer>(`/customers/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/customers/${id}`);
  },

  updateBillingAddress: async (id: string, request: UpdateBillingAddressRequest): Promise<Customer> => {
    const response = await apiClient.put<Customer>(`/customers/${id}/billing-address`, request);
    return response.data;
  },

  getServiceLocations: async (customerId: string): Promise<ServiceLocation[]> => {
    const response = await apiClient.get<ServiceLocation[]>(`/customers/${customerId}/service-locations`);
    return response.data;
  },

  addServiceLocation: async (customerId: string, request: CreateServiceLocationRequest): Promise<ServiceLocation> => {
    const response = await apiClient.post<ServiceLocation>(`/customers/${customerId}/service-locations`, request);
    return response.data;
  },

  updateServiceLocation: async (
    customerId: string,
    locationId: string,
    request: UpdateServiceLocationRequest
  ): Promise<ServiceLocation> => {
    const response = await apiClient.put<ServiceLocation>(
      `/customers/${customerId}/service-locations/${locationId}`,
      request
    );
    return response.data;
  },

  updateServiceLocationAddress: async (
    customerId: string,
    locationId: string,
    request: UpdateServiceLocationAddressRequest
  ): Promise<ServiceLocation> => {
    const response = await apiClient.put<ServiceLocation>(
      `/customers/${customerId}/service-locations/${locationId}/address`,
      request
    );
    return response.data;
  },

  closeServiceLocation: async (customerId: string, locationId: string): Promise<ServiceLocation> => {
    const response = await apiClient.post<ServiceLocation>(
      `/customers/${customerId}/service-locations/${locationId}/close`
    );
    return response.data;
  },

  search: async (name: string): Promise<Customer[]> => {
    const response = await apiClient.get<Customer[]>('/customers/search', {
      params: { name },
    });
    return response.data;
  },
};

export default customerApi;
