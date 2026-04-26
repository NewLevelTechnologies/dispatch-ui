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

export interface AdditionalContact {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLocation {
  id: string;
  customerId: string;
  dispatchRegionId: string;
  locationName?: string | null;
  address: Address;
  previousLocationId?: string | null;
  successionDate?: string | null;
  successionType?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  additionalContacts: AdditionalContact[];
  accessInstructions?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ServiceLocationSearchResult {
  id: string;
  customerId: string;
  customerName: string;
  locationName?: string | null;
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

export interface ServiceLocationSearchResponse {
  content: ServiceLocationSearchResult[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

// Paginated response types (Spring Page structure)
export interface Pageable {
  pageNumber: number;    // 0-indexed
  pageSize: number;
  sort: {
    sorted: boolean;
    unsorted: boolean;
    empty: boolean;
  };
  offset: number;
  paged: boolean;
  unpaged: boolean;
}

export interface CustomerListDto {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  billingAddress: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
  serviceLocationCount: number;
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier?: string | null;
  status: CustomerStatus;
  displayMode: CustomerDisplayMode;
}

export interface CustomerListResponse {
  content: CustomerListDto[];
  pageable: Pageable;
  totalElements: number;
  totalPages: number;
  number: number;        // 0-indexed page number
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  displayMode: CustomerDisplayMode;
}

export interface CustomerSearchResponse {
  content: CustomerSearchResult[];
  pageable: Pageable;
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface ServiceLocationListDto {
  id: string;
  customerId: string;
  customerName: string;
  customerDisplayMode: CustomerDisplayMode;
  locationName?: string | null;
  address: Address;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLocationListResponse {
  content: ServiceLocationListDto[];
  pageable: Pageable;
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// Service Location Detail DTO - for detail views
// Includes everything: full location + customer info + contacts
export interface ServiceLocationDetailDto {
  id: string;
  customerId: string;
  customerName: string;
  customerDisplayMode: CustomerDisplayMode;
  dispatchRegionId: string;
  locationName?: string | null;
  address: Address;
  previousLocationId?: string | null;
  successionDate?: string | null;
  successionType?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  additionalContacts: AdditionalContact[];
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
  additionalContacts: AdditionalContact[];
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
  dispatchRegionId: string;
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
  dispatchRegionId?: string;
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
  // Paginated list (BREAKING: was getAll returning Customer[])
  getAllPaginated: async (params?: {
    page?: number;     // 1-indexed for UI, converted to 0-indexed for API
    limit?: number;
    status?: 'ACTIVE' | 'INACTIVE';
    search?: string;
    sort?: string;     // e.g., "name,desc"
  }): Promise<CustomerListResponse> => {
    const apiParams = {
      page: params?.page ? params.page - 1 : 0,  // Convert to 0-indexed
      limit: params?.limit,
      status: params?.status,
      search: params?.search,
      sort: params?.sort,
    };
    const response = await apiClient.get<CustomerListResponse>('/customers', {
      params: apiParams,
    });
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

  // Service Location standalone endpoints (no customerId needed in path)
  updateServiceLocation: async (
    locationId: string,
    request: UpdateServiceLocationRequest
  ): Promise<ServiceLocation> => {
    const response = await apiClient.put<ServiceLocation>(
      `/service-locations/${locationId}`,
      request
    );
    return response.data;
  },

  updateServiceLocationAddress: async (
    locationId: string,
    request: UpdateServiceLocationAddressRequest
  ): Promise<ServiceLocation> => {
    const response = await apiClient.put<ServiceLocation>(
      `/service-locations/${locationId}/address`,
      request
    );
    return response.data;
  },

  closeServiceLocation: async (locationId: string): Promise<ServiceLocation> => {
    const response = await apiClient.post<ServiceLocation>(
      `/service-locations/${locationId}/close`
    );
    return response.data;
  },

  deleteServiceLocation: async (locationId: string): Promise<void> => {
    await apiClient.delete(`/service-locations/${locationId}`);
  },

  // Paginated search for pickers (BREAKING: was search(name) returning Customer[])
  search: async (params: {
    q: string;         // Query string (was "name")
    page?: number;     // 0-indexed
    size?: number;
    sort?: string;
  }): Promise<CustomerSearchResponse> => {
    const response = await apiClient.get<CustomerSearchResponse>('/customers/search', {
      params,
    });
    return response.data;
  },

  searchServiceLocations: async (query: string, page = 0, size = 50): Promise<ServiceLocationSearchResponse> => {
    const response = await apiClient.get<ServiceLocationSearchResponse>('/service-locations/search', {
      params: { q: query, page, size },
    });
    return response.data;
  },

  // New paginated service locations list
  getAllServiceLocationsPaginated: async (params?: {
    page?: number;     // 1-indexed for UI
    limit?: number;
    status?: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
    search?: string;
    dispatchRegionId?: string;
    sort?: string;
  }): Promise<ServiceLocationListResponse> => {
    const apiParams: Record<string, string | number | undefined> = {
      page: params?.page ? params.page - 1 : 0,  // Convert to 0-indexed
      limit: params?.limit,
      status: params?.status,
      search: params?.search,
      dispatchRegionId: params?.dispatchRegionId,
      sort: params?.sort,
    };
    // Strip empty values so we don't send ?dispatchRegionId= etc.
    for (const key of Object.keys(apiParams)) {
      const v = apiParams[key];
      if (v === undefined || v === '' || v === null) delete apiParams[key];
    }
    const response = await apiClient.get<ServiceLocationListResponse>('/service-locations', {
      params: apiParams,
    });
    return response.data;
  },

  // Get single service location by ID (full details with customer info and contacts)
  getServiceLocationById: async (id: string): Promise<ServiceLocationDetailDto> => {
    const response = await apiClient.get<ServiceLocationDetailDto>(`/service-locations/${id}`);
    return response.data;
  },
};

export default customerApi;
