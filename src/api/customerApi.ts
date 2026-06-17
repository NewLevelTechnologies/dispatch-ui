// Customer API Client
import apiClient from './client';
import type { NoteDto } from './noteApi';
import type { ArrivalFactDto } from './arrivalFactApi';

export interface Address {
  streetAddress: string;
  streetAddressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  // IANA timezone id derived server-side from the coordinates (continental US
  // only; null outside it, or before the async geocode completes).
  timeZone?: string | null;
  // DEPRECATED — USPS-era fields, no longer populated for new/edited addresses.
  // Do NOT use as a quality/validity signal; the live signal is the
  // /customers/addresses/verify `located` flag + presence of coordinates.
  validated?: boolean;
  validatedAt?: string | null;
  dpvConfirmation?: string | null;
  isBusiness?: boolean;
}

// Address payload accepted by the create/update endpoints. `latitude`/`longitude`
// are optional — pass the coords from POST /customers/addresses/verify so the
// map pin + timezone store immediately; omit them and the server geocodes
// asynchronously after save (coords/timezone appear a moment later). Otherwise
// the server stores exactly what you submit — no silent normalization.
export interface AddressInput {
  streetAddress: string;
  streetAddressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  latitude?: number | null;
  longitude?: number | null;
}

// POST /customers/addresses/verify — geocodes (free US Census) WITHOUT saving,
// returning a standardized "did you mean?" single line + coords + timezone.
// Always HTTP 200; `located: false` means "couldn't resolve it", not an error.
export interface AddressVerifyRequest {
  streetAddress: string;
  streetAddressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface AddressVerifyResponse {
  located: boolean;
  // Census-standardized single line for a "did you mean?" prompt, e.g.
  // "123 MAIN ST, CHICAGO, IL, 60601". NOT broken into structured fields.
  suggestedSingleLine: string | null;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
}

export interface AdditionalContact {
  id: string;
  name: string;
  // Relationship to the site (e.g. "Property manager"), not a corporate title.
  // Net-new field — there was never a `title` to migrate from. Free text; FE
  // offers a typeahead of common values.
  role?: string | null;
  // Three optional numbers, digits-only on the wire. The card surfaces the
  // best-reach one (mobile, else office); all are editable in the contact form.
  phone?: string | null;
  mobilePhone?: string | null;
  afterHoursPhone?: string | null;
  email?: string | null;
  notes?: string | null;
  displayOrder: number;
  // Exactly one contact per location is primary; it's projected onto the
  // location's siteContact* fields. Absent/false for customer-level contacts.
  isPrimary?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Explicit per-location fact: what is a tech walking into. Set by a human,
// never inferred from address. Backwards-compat: optional until BE migration
// lands; consumers default to BUSINESS visually.
export type PremiseType = 'BUSINESS' | 'RESIDENCE';

export interface ServiceLocation {
  id: string;
  // Server-assigned, read-only identifier (e.g. "L-00042"). Never sent on
  // create/update; backfilled records already have numbers.
  locationNumber?: string;
  customerId: string;
  dispatchRegionId: string;
  locationName?: string | null;
  address: Address;
  premiseType?: PremiseType | null;
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
  // Per-location enrichment, batched server-side onto the customer DETAIL
  // payload's serviceLocations[] only — absent on create/update responses and
  // the standalone location read, hence all optional (see LOC-1).
  // `dispatchRegionName` is null on a region-cache miss; `balance` is open AR
  // for THIS site in decimal dollars (0 = known zero). pmOverdue /
  // nextScheduledAt are Phase 3.
  dispatchRegionName?: string | null;
  hasOpenJobs?: boolean;
  openJobsCount?: number;
  lastServiceAt?: string | null;
  techOnSite?: boolean;
  balance?: number;
}

export interface ServiceLocationSearchResult {
  id: string;
  locationNumber?: string;
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

// Tag summary shape — matches feature/customer-tags backend.
// Color is a hex string ('#3b82f6' etc.); confirm with backend if format changes.
export interface TagSummary {
  id: string;
  name: string;
  color: string;
}

export interface CustomerListDto {
  id: string;
  // Server-assigned, read-only identifier (e.g. "C-00042"). Never sent on
  // create/update; backfilled records already have numbers.
  customerNumber?: string;
  name: string;
  email: string;
  phone?: string | null;
  type: CustomerType;
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
  // Denormalized read fields synced via events from finance + job services.
  // Optional on the FE so the page renders before the BE flags land.
  hasOpenBalance?: boolean;
  hasAgedBalance?: boolean;
  hasOpenJobs?: boolean;
  openJobsCount?: number;
  lastServiceAt?: string | null;
  tags?: TagSummary[];
  // Per-row AR financials — the point of the Payers list (PAYERS-LIST-1). On
  // every customer row, but only the payers list surfaces them. Sourced from
  // customer-service's event mirror, so they can briefly lag the authoritative
  // ar-summary on the detail page (fine for a list; same tradeoff as the
  // open/aged chips). Optional — absent until the BE denorm is deployed.
  openBalanceTotal?: number;
  aged91Total?: number;
  openInvoiceCount?: number;
  lifetimePaid?: number;
  lastPaymentAt?: string | null;
  lastPaymentAmount?: number | null;
  currency?: string;
}

// Chip counts envelope on list responses. Reflects the search-filtered set
// ignoring the chip currently being counted, so e.g. "Active 412" does
// not drop to zero when Active is the only selected status.
export interface CustomerListCounts {
  total?: number;
  active?: number;
  inactive?: number;
  openBalance?: number;
  openJobs?: number;
  aged?: number;
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
  counts?: CustomerListCounts;
}

export interface CustomerSearchResult {
  id: string;
  customerNumber?: string;
  name: string;
  type: CustomerType;
  category?: CustomerCategory | null;
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
  locationNumber?: string;
  customerId: string;
  customerName: string;
  locationName?: string | null;
  // Explicit per-location premise — drives the glyph + Business/Residence
  // filter. Required on BE responses; backfilled from USPS DPV business flag.
  premiseType: PremiseType;
  address: Address;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  // Denormalized read fields synced via events from job + agreement + dispatch
  // services. Optional on the FE so the page renders before the BE flags land.
  dispatchRegionId?: string | null;
  dispatchRegionName?: string | null;
  hasOpenJobs?: boolean;
  pmOverdue?: boolean;
  techOnSite: boolean;
  lastServiceAt?: string | null;
  tags?: TagSummary[];
}

export interface ServiceLocationListCounts {
  total?: number;
  active?: number;
  inactive?: number;
  closed?: number;
  customerCount?: number;
  live?: number;
  openJobs?: number;
  overdue?: number;
  business?: number;
  residence?: number;
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
  counts?: ServiceLocationListCounts;
}

// Service Location Detail DTO - for detail views
// Includes everything: full location + customer info + contacts
export interface ServiceLocationDetailDto {
  id: string;
  locationNumber?: string;
  customerId: string;
  customerName: string;
  premiseType: PremiseType;
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
  // Pinned-first note collection (server-ordered). Replaced the legacy single
  // free-form string; the string still rides the basic ServiceLocation DTO +
  // create/update payloads (backfilled into this collection) until it's dropped.
  // Usable for first paint; the card refetches GET /service-locations/{id}/notes
  // as the live source for add/edit/pin/delete.
  notes?: NoteDto[] | null;
  // Structured arrival facts (gate code, lockbox, parking, …) — the label/value
  // list beside `accessInstructions`. Server-ordered by displayOrder. Seeds the
  // Site instructions card's first paint; the card refetches
  // GET /service-locations/{id}/arrival-facts as the live source.
  arrivalFacts?: ArrivalFactDto[] | null;
  // Tenant-learned label typeahead seed (distinct labels already in use). Empty
  // on a fresh tenant; the card falls back to a default seed.
  suggestedFactLabels?: string[] | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  // Presigned thumb of the SITE PHOTO — the single canonical front-of-building
  // shot (a location-scoped image file with isProfile=true). Renders as the
  // banner on the Site instructions card; null = no photo set (slim "Add site
  // photo" placeholder). NOT the avatar/mark — that stays the premise glyph.
  // Short-TTL URL — don't cache.
  profileImageThumbnailUrl?: string | null;
  // Full-size presigned URL of the same file, for the banner's lightbox.
  // PENDING BACKEND — asked alongside the thumb; lightbox falls back to the
  // thumb until it lands.
  profileImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  // Region label, resolved on the payload (no separate dispatch-region fetch
  // needed). May be null → omit the header region item.
  region?: { abbreviation?: string | null; name?: string | null } | null;
  // Parent-customer billing context for the Billed-to mini-card.
  customerStatus?: CustomerStatus | null;
  customerType?: CustomerType | null;
  customerPaymentTermsDays?: number | null;
  // Billed-to financial state (financial-service AR rollup — FIN-2). Both ride
  // the detail payload, no separate FE fetch. Amounts are decimal dollars.
  // null = unknown/unavailable (figure omitted); 0 = known-zero (rendered muted).
  customerOutstandingBalance?: number | null; // customer total AR across all locations
  openInvoiceAmount?: number | null; // this location's open-invoice total
  openInvoiceCount?: number | null; // this location's open-invoice count
  // Tenant tags (id/name/color), same shape as the list DTO.
  tags?: TagSummary[];
  // Denormalized operational flags for the attention strip. Booleans only —
  // the live-tech detail (name/WO/since), open-job counts, PM-overdue, and
  // equipment flags come from dispatch / work-order / inventory services.
  techOnSite?: boolean;
  hasOpenJobs?: boolean;
  lastServiceAt?: string | null;
}

export type CustomerType = 'STANDARD' | 'BILLING_ONLY';
// CustomerCategory is legacy — the residential/commercial concept was wrong
// for customers (a property-management company owns residential locations).
// Retained on the type to keep CustomerDetailPage compiling against existing
// reads; new surfaces should use CustomerShape (computed at read on the
// detail endpoint) for layout decisions and Location.premiseType for the
// "what is a tech walking into" question.
export type CustomerCategory = 'RESIDENTIAL' | 'COMMERCIAL' | 'BILLING_ONLY';
// Structural shape derived from address topology — single-site, multi-site,
// or billing-only. Lives on the detail response, never on the list. Drives
// detail-page render density only.
export type CustomerShape = 'SINGLE' | 'MULTI' | 'BILLING_ONLY';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id: string;
  customerNumber?: string;
  name: string;
  email: string;
  phone?: string | null;
  type: CustomerType;
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
  // Legacy — kept optional so CustomerDetailPage's existing reads still
  // compile while the detail-page migration is in flight. New surfaces use
  // `shape` below.
  category?: CustomerCategory | null;
  // Structural shape (SINGLE / MULTI / BILLING_ONLY), computed-at-read on
  // the detail endpoint. Detail-page render density consumer.
  shape?: CustomerShape | null;
  // Denormalized onto the detail (GET /customers/{id}) payload — see ID-1 /
  // TAG-1. `accountManager.name` is resolved server-side from the user cache.
  // Create/update responses echo the core record but leave these at defaults,
  // so refetch the detail for the full picture.
  accountManager?: { id: string; name: string } | null;
  industry?: string | null;
  tags?: TagSummary[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateServiceLocationRequest {
  dispatchRegionId: string;
  locationName?: string | null;
  // Omitting premiseType lets the server seed from the tenant default
  // (tenantSettings.defaultPremiseType). Provide to override per-location.
  premiseType?: PremiseType;
  address: AddressInput;
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
  type?: CustomerType;
  billingAddress: AddressInput;
  serviceLocations: CreateServiceLocationRequest[];
  billingAddressSameAsService?: boolean;
  paymentTermsDays?: number;
  requiresPurchaseOrder?: boolean;
  contractPricingTier?: string | null;
  taxExempt?: boolean;
  taxExemptCertificate?: string | null;
  notes?: string | null;
  // ID-1: account manager is an internal user — send the user id, the server
  // resolves accountManager.name from the user cache. Industry is free text
  // (≤100 chars).
  accountManagerUserId?: string | null;
  industry?: string | null;
}

export interface UpdateCustomerRequest {
  name: string;
  email: string;
  phone?: string | null;
  type?: CustomerType;
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier?: string | null;
  taxExempt: boolean;
  taxExemptCertificate?: string | null;
  notes?: string | null;
  status: CustomerStatus;
  // ID-1 — see CreateCustomerRequest. Omit to leave unchanged.
  accountManagerUserId?: string | null;
  industry?: string | null;
  // Combined billing-address edit — include to save identity + address in a
  // single PUT, with no read-modify-write race against the dedicated
  // /billing-address endpoint. Omit (or send null) to leave the address
  // unchanged; existing identity-only payloads keep working. Send
  // latitude/longitude from POST /customers/addresses/verify so the pin +
  // timezone persist immediately; never send timeZone (derived server-side).
  // The standalone updateBillingAddress() still exists for address-only edits.
  billingAddress?: AddressInput | null;
}

export interface UpdateBillingAddressRequest {
  billingAddress: AddressInput;
}

export interface UpdateServiceLocationRequest {
  dispatchRegionId?: string;
  locationName?: string | null;
  // Omit to preserve the existing value.
  premiseType?: PremiseType;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

export type UpdateServiceLocationAddressRequest = AddressInput;

export const customerApi = {
  // Paginated list (BREAKING: was getAll returning Customer[])
  getAllPaginated: async (params?: {
    page?: number;     // 1-indexed for UI, converted to 0-indexed for API
    limit?: number;
    // Status is multi-value — caller passes the array of selected statuses
    // from the StatusPickerChip. Serialized as a single comma-separated
    // value on the wire (?status=ACTIVE,INACTIVE) to match the BE contract.
    // Backend default-excludes BILLING_ONLY; use /customers/payers for those.
    status?: Array<'ACTIVE' | 'INACTIVE'>;
    search?: string;
    sort?: string;     // e.g., "name,desc"
    hasOpenBalance?: boolean;
    hasAgedBalance?: boolean;
    hasOpenJobs?: boolean;
    // Tag UUIDs — OR semantics within the param. Serialized comma-separated.
    // Malformed UUIDs return 400 from the BE.
    tagIds?: string[];
  }): Promise<CustomerListResponse> => {
    const apiParams: Record<string, string | number | boolean | undefined> = {
      page: params?.page ? params.page - 1 : 0,  // Convert to 0-indexed
      limit: params?.limit,
      status:
        params?.status && params.status.length > 0
          ? params.status.join(',')
          : undefined,
      search: params?.search,
      sort: params?.sort,
      openBalance: params?.hasOpenBalance || undefined,
      agedBalance: params?.hasAgedBalance || undefined,
      openJobs: params?.hasOpenJobs || undefined,
      tags:
        params?.tagIds && params.tagIds.length > 0
          ? params.tagIds.join(',')
          : undefined,
    };
    // Strip empty values so the URL stays clean.
    for (const key of Object.keys(apiParams)) {
      const v = apiParams[key];
      if (v === undefined || v === '' || v === null) delete apiParams[key];
    }
    const response = await apiClient.get<CustomerListResponse>('/customers', {
      params: apiParams,
    });
    return response.data;
  },

  // Payers list — BILLING_ONLY customers, enriched with the per-row AR
  // financials (PAYERS-LIST-1: openBalanceTotal / aged91Total / openInvoiceCount
  // / lifetimePaid / lastPaymentAt+Amount / currency). Same response shape as
  // getAllPaginated. NOTE: this route's `page` is 1-indexed (default 1) — do NOT
  // -1 it like /customers. Omit `sort` to get the bookkeeper default
  // (outstanding,desc). Sort keys: outstanding | aged91 | openInvoices |
  // lifetimePaid | lastPayment | name | terms | createdAt.
  getPayers: async (params?: {
    page?: number;     // 1-indexed
    limit?: number;
    search?: string;
    sort?: string;     // "<key>,<asc|desc>"
  }): Promise<CustomerListResponse> => {
    const apiParams: Record<string, string | number | undefined> = {
      page: params?.page ?? 1,
      limit: params?.limit,
      search: params?.search,
      sort: params?.sort,
    };
    for (const key of Object.keys(apiParams)) {
      const v = apiParams[key];
      if (v === undefined || v === '') delete apiParams[key];
    }
    const response = await apiClient.get<CustomerListResponse>('/customers/payers', {
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

  // Geocode-preview an address without saving — drives the "did you mean?"
  // suggestion + captures coords/timezone to send on the subsequent save.
  verifyAddress: async (request: AddressVerifyRequest): Promise<AddressVerifyResponse> => {
    const response = await apiClient.post<AddressVerifyResponse>('/customers/addresses/verify', request);
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
    // Status is multi-value — caller passes the array from StatusPickerChip
    // (e.g. ['ACTIVE', 'INACTIVE']). Serialized comma-separated on the wire.
    status?: Array<'ACTIVE' | 'INACTIVE' | 'CLOSED'>;
    search?: string;
    dispatchRegionId?: string;
    sort?: string;
    // Denormalized boolean filters from job/agreement/dispatch events.
    // `live=true` returns locations with a tech currently on site.
    live?: boolean;
    hasOpenJobs?: boolean;
    pmOverdue?: boolean;
    // Premise filter is the Business/Residence axis on Locations.
    // BE param name is `premise` (lowercase value).
    premise?: 'business' | 'residence';
    // Tag UUIDs — OR semantics within the param. Serialized comma-separated.
    // Malformed UUIDs return 400 from the BE.
    tagIds?: string[];
  }): Promise<ServiceLocationListResponse> => {
    const apiParams: Record<string, string | number | boolean | undefined> = {
      page: params?.page ? params.page - 1 : 0,  // Convert to 0-indexed
      limit: params?.limit,
      status:
        params?.status && params.status.length > 0
          ? params.status.join(',')
          : undefined,
      search: params?.search,
      dispatchRegionId: params?.dispatchRegionId,
      sort: params?.sort,
      live: params?.live || undefined,
      openJobs: params?.hasOpenJobs || undefined,
      pmOverdue: params?.pmOverdue || undefined,
      premise: params?.premise,
      tags:
        params?.tagIds && params.tagIds.length > 0
          ? params.tagIds.join(',')
          : undefined,
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
