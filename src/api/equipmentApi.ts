// Equipment API Client
import apiClient from './client';
import type { Page } from './workOrderApi';

// ========== EQUIPMENT ==========

export type EquipmentStatus = 'ACTIVE' | 'RETIRED';

export const EquipmentStatus = {
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
} as const;

export interface Equipment {
  id: string;
  tenantId?: string;
  name: string;
  description?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  parentId?: string | null;
  equipmentTypeId?: string | null;
  equipmentTypeName?: string | null;
  equipmentCategoryId?: string | null;
  equipmentCategoryName?: string | null;
  serviceLocationId: string;
  locationOnSite?: string | null;
  installDate?: string | null;
  lastServicedAt?: string | null;
  warrantyExpiresAt?: string | null;
  warrantyDetails?: string | null;
  status: EquipmentStatus;
  // Convenience: presigned URL of the profile image (the one with isProfile=true
  // in the embedded images array). Null when no images exist or none flagged
  // profile. Re-fetch on each page load — the URL is short-lived (~1hr).
  profileImageUrl?: string | null;
  // JSONB stored as string per backend; parse client-side when needed.
  attributes?: string;
  // Filters embedded in EquipmentResponse; the standalone /equipment/{id}/filters
  // endpoint also returns these and is the canonical mutation target.
  filters?: EquipmentFilter[];
  // Images embedded in EquipmentResponse; the standalone /equipment/{id}/images
  // endpoint is the canonical mutation target. Sorted profile-first then by
  // sortOrder ascending.
  images?: EquipmentImage[];
  createdAt?: string;
  updatedAt?: string;
}

// Slim projection returned by the list endpoint and embedded on WorkItemResponse.equipment.
export interface EquipmentSummary {
  id: string;
  name: string;
  equipmentTypeName?: string | null;
  equipmentCategoryName?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  locationOnSite?: string | null;
  // Service location & customer context, batch-loaded server-side. Returned as
  // discrete fields rather than a pre-formatted label so the UI can compose
  // display variants (with/without customer name, etc.).
  serviceLocationId?: string | null;
  serviceLocationName?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  // Presigned URL of the profile image, if any. Short-lived; re-fetch on
  // navigation rather than caching.
  profileImageUrl?: string | null;
  customerName?: string | null;
}

export interface CreateEquipmentRequest {
  name: string;
  serviceLocationId: string;
  description?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  parentId?: string | null;
  equipmentTypeId?: string | null;
  equipmentCategoryId?: string | null;
  locationOnSite?: string | null;
  installDate?: string | null;
  warrantyExpiresAt?: string | null;
  warrantyDetails?: string | null;
  status?: EquipmentStatus;
  profileImageUrl?: string | null;
  attributes?: string;
}

// PATCH semantics: omit a field for no change, send null to clear, send a value to set.
// serviceLocationId cannot be changed via PATCH; lastServicedAt is backend-managed.
export interface UpdateEquipmentRequest {
  name?: string;
  description?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  parentId?: string | null;
  equipmentTypeId?: string | null;
  equipmentCategoryId?: string | null;
  locationOnSite?: string | null;
  installDate?: string | null;
  warrantyExpiresAt?: string | null;
  warrantyDetails?: string | null;
  status?: EquipmentStatus;
  profileImageUrl?: string | null;
  attributes?: string;
}

export type EquipmentSortField =
  | 'name'
  | 'createdAt'
  | 'updatedAt'
  | 'lastServicedAt'
  | 'installDate';

export type EquipmentSortDirection = 'asc' | 'desc';

export interface ListEquipmentParams {
  serviceLocationId?: string;
  customerId?: string;
  equipmentTypeId?: string;
  equipmentCategoryId?: string;
  search?: string;
  status?: EquipmentStatus;
  sortBy?: EquipmentSortField;
  sortDir?: EquipmentSortDirection;
  page?: number;
  size?: number;
}

function cleanParams(params?: ListEquipmentParams): Record<string, string | number | boolean> {
  if (!params) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export const equipmentApi = {
  list: async (params?: ListEquipmentParams): Promise<Page<EquipmentSummary>> => {
    const response = await apiClient.get<Page<EquipmentSummary>>('/equipment', {
      params: cleanParams(params),
    });
    return response.data;
  },

  getById: async (id: string): Promise<Equipment> => {
    const response = await apiClient.get<Equipment>(`/equipment/${id}`);
    return response.data;
  },

  create: async (request: CreateEquipmentRequest): Promise<Equipment> => {
    const response = await apiClient.post<Equipment>('/equipment', request);
    return response.data;
  },

  update: async (id: string, request: UpdateEquipmentRequest): Promise<Equipment> => {
    const response = await apiClient.patch<Equipment>(`/equipment/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/equipment/${id}`);
  },
};

// ========== EQUIPMENT TYPES (taxonomy) ==========

export interface EquipmentType {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentTypeRequest {
  name: string;
  sortOrder?: number;
}

export interface UpdateEquipmentTypeRequest {
  name?: string;
  sortOrder?: number;
}

export const equipmentTypesApi = {
  getAll: async (): Promise<EquipmentType[]> => {
    const response = await apiClient.get<EquipmentType[]>('/equipment/config/types');
    return response.data;
  },

  create: async (request: CreateEquipmentTypeRequest): Promise<EquipmentType> => {
    const response = await apiClient.post<EquipmentType>('/equipment/config/types', request);
    return response.data;
  },

  update: async (id: string, request: UpdateEquipmentTypeRequest): Promise<EquipmentType> => {
    const response = await apiClient.patch<EquipmentType>(`/equipment/config/types/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/equipment/config/types/${id}`);
  },

  reorder: async (orderedIds: string[]): Promise<EquipmentType[]> => {
    const response = await apiClient.post<EquipmentType[]>(
      '/equipment/config/types/reorder',
      orderedIds
    );
    return response.data;
  },
};

// ========== EQUIPMENT CATEGORIES (taxonomy) ==========

export interface EquipmentCategory {
  id: string;
  tenantId: string;
  equipmentTypeId: string;
  name: string;
  sortOrder: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentCategoryRequest {
  equipmentTypeId: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateEquipmentCategoryRequest {
  name?: string;
  sortOrder?: number;
}

export const equipmentCategoriesApi = {
  getAll: async (equipmentTypeId?: string): Promise<EquipmentCategory[]> => {
    const params = equipmentTypeId ? { equipmentTypeId } : undefined;
    const response = await apiClient.get<EquipmentCategory[]>('/equipment/config/categories', {
      params,
    });
    return response.data;
  },

  create: async (request: CreateEquipmentCategoryRequest): Promise<EquipmentCategory> => {
    const response = await apiClient.post<EquipmentCategory>(
      '/equipment/config/categories',
      request
    );
    return response.data;
  },

  update: async (
    id: string,
    request: UpdateEquipmentCategoryRequest
  ): Promise<EquipmentCategory> => {
    const response = await apiClient.patch<EquipmentCategory>(
      `/equipment/config/categories/${id}`,
      request
    );
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/equipment/config/categories/${id}`);
  },

  reorder: async (
    equipmentTypeId: string,
    orderedIds: string[]
  ): Promise<EquipmentCategory[]> => {
    const response = await apiClient.post<EquipmentCategory[]>(
      '/equipment/config/categories/reorder',
      { equipmentTypeId, orderedIds }
    );
    return response.data;
  },
};

// ========== EQUIPMENT FILTERS ==========
// Per-equipment filter sub-resource. Sized in inches.

export interface EquipmentFilter {
  id: string;
  tenantId?: string;
  equipmentId: string;
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  quantity: number;
  label?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEquipmentFilterRequest {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  quantity?: number;
  label?: string | null;
}

// PATCH semantics: omit a field for no change, send null to clear, send a value to set.
export interface UpdateEquipmentFilterRequest {
  lengthIn?: number;
  widthIn?: number;
  thicknessIn?: number;
  quantity?: number;
  label?: string | null;
}

export const equipmentFiltersApi = {
  getAll: async (equipmentId: string): Promise<EquipmentFilter[]> => {
    const response = await apiClient.get<EquipmentFilter[]>(
      `/equipment/${equipmentId}/filters`
    );
    return response.data;
  },

  create: async (
    equipmentId: string,
    request: CreateEquipmentFilterRequest
  ): Promise<EquipmentFilter> => {
    const response = await apiClient.post<EquipmentFilter>(
      `/equipment/${equipmentId}/filters`,
      request
    );
    return response.data;
  },

  update: async (
    equipmentId: string,
    filterId: string,
    request: UpdateEquipmentFilterRequest
  ): Promise<EquipmentFilter> => {
    const response = await apiClient.patch<EquipmentFilter>(
      `/equipment/${equipmentId}/filters/${filterId}`,
      request
    );
    return response.data;
  },

  delete: async (equipmentId: string, filterId: string): Promise<void> => {
    await apiClient.delete(`/equipment/${equipmentId}/filters/${filterId}`);
  },
};

// ========== TENANT FILTER SIZES ==========
// Tenant-configurable "common sizes" used to populate the quick-add chips on
// the equipment filters tab. Read-only on the detail page; admin CRUD lives on
// a settings page (separate effort).

export interface TenantFilterSize {
  id: string;
  tenantId: string;
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  sortOrder: number;
  archivedAt?: string | null;
  createdAt: string;
}

export interface CreateTenantFilterSizeRequest {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  sortOrder?: number;
}

export interface UpdateTenantFilterSizeRequest {
  lengthIn?: number;
  widthIn?: number;
  thicknessIn?: number;
  sortOrder?: number;
}

export const tenantFilterSizesApi = {
  getAll: async (): Promise<TenantFilterSize[]> => {
    const response = await apiClient.get<TenantFilterSize[]>(
      '/equipment/config/filter-sizes'
    );
    return response.data;
  },

  create: async (request: CreateTenantFilterSizeRequest): Promise<TenantFilterSize> => {
    const response = await apiClient.post<TenantFilterSize>(
      '/equipment/config/filter-sizes',
      request
    );
    return response.data;
  },

  update: async (
    id: string,
    request: UpdateTenantFilterSizeRequest
  ): Promise<TenantFilterSize> => {
    const response = await apiClient.patch<TenantFilterSize>(
      `/equipment/config/filter-sizes/${id}`,
      request
    );
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/equipment/config/filter-sizes/${id}`);
  },

  reorder: async (orderedIds: string[]): Promise<TenantFilterSize[]> => {
    const response = await apiClient.post<TenantFilterSize[]>(
      '/equipment/config/filter-sizes/reorder',
      orderedIds
    );
    return response.data;
  },
};

// ========== FILTER PULL LIST (REPORT) ==========
// Aggregates equipment_filters across all equipment attached to non-cancelled
// work orders scheduled in the requested date window. Backend requires either
// scheduledDate (single day) or scheduledDateFrom (range).

export interface FilterPullListEntry {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  totalQuantity: number;
  equipmentCount: number;
}

export interface FilterPullListParams {
  /** Single-day mode (YYYY-MM-DD). Mutually exclusive with the From/To pair. */
  scheduledDate?: string;
  /** Range start (YYYY-MM-DD). Required if scheduledDate is omitted. */
  scheduledDateFrom?: string;
  /** Range end (YYYY-MM-DD). Inclusive on the backend side. */
  scheduledDateTo?: string;
}

export const reportsApi = {
  filterPullList: async (params: FilterPullListParams): Promise<FilterPullListEntry[]> => {
    const response = await apiClient.get<FilterPullListEntry[]>(
      '/equipment/filter-pull-list',
      { params }
    );
    return response.data;
  },
};

// ========== EQUIPMENT IMAGES ==========
// Multi-image sub-resource per equipment. Upload is a 3-step direct-to-S3 flow
// (request URL → PUT to S3 → confirm) so the API server never streams bytes.
// `url` and `thumbnailUrl` are presigned reads with ~1hr TTL — never cache them
// across navigations; always read from the freshest API response.

export const EQUIPMENT_IMAGE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT = 50;
export const EQUIPMENT_IMAGE_CAPTION_MAX_CHARS = 200;
export const EQUIPMENT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type EquipmentImageContentType = (typeof EQUIPMENT_IMAGE_CONTENT_TYPES)[number];

export interface EquipmentImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  contentType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  thumbnailWidthPx: number | null;
  thumbnailHeightPx: number | null;
  isProfile: boolean;
  sortOrder: number;
  caption: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface RequestImageUploadUrlRequest {
  contentType: EquipmentImageContentType;
  sizeBytes: number;
  caption?: string | null;
}

export interface RequestImageUploadUrlResponse {
  imageId: string;
  uploadUrl: string;
  s3Key: string;
}

export interface UpdateEquipmentImageRequest {
  isProfile?: boolean;
  caption?: string | null;
  sortOrder?: number;
}

export const equipmentImagesApi = {
  list: async (equipmentId: string): Promise<EquipmentImage[]> => {
    const response = await apiClient.get<EquipmentImage[]>(
      `/equipment/${equipmentId}/images`
    );
    return response.data;
  },

  requestUploadUrl: async (
    equipmentId: string,
    request: RequestImageUploadUrlRequest
  ): Promise<RequestImageUploadUrlResponse> => {
    const response = await apiClient.post<RequestImageUploadUrlResponse>(
      `/equipment/${equipmentId}/images/upload-url`,
      request
    );
    return response.data;
  },

  // Direct-to-S3 PUT using fetch (NOT the apiClient — we don't want our auth
  // interceptor adding the JWT to the S3 request).
  uploadToS3: async (uploadUrl: string, contentType: string, file: File | Blob): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`S3 upload failed with ${res.status}`);
    }
  },

  confirm: async (equipmentId: string, imageId: string): Promise<EquipmentImage> => {
    const response = await apiClient.post<EquipmentImage>(
      `/equipment/${equipmentId}/images/${imageId}/confirm`
    );
    return response.data;
  },

  /**
   * Convenience helper that orchestrates the 3-step upload. Calls the
   * `onProgress` callback between steps so callers can render status text.
   */
  upload: async (
    equipmentId: string,
    file: File,
    options: {
      caption?: string | null;
      onProgress?: (stage: 'requesting' | 'uploading' | 'confirming') => void;
    } = {}
  ): Promise<EquipmentImage> => {
    options.onProgress?.('requesting');
    const { imageId, uploadUrl } = await equipmentImagesApi.requestUploadUrl(equipmentId, {
      contentType: file.type as EquipmentImageContentType,
      sizeBytes: file.size,
      caption: options.caption ?? null,
    });
    options.onProgress?.('uploading');
    await equipmentImagesApi.uploadToS3(uploadUrl, file.type, file);
    options.onProgress?.('confirming');
    return equipmentImagesApi.confirm(equipmentId, imageId);
  },

  patch: async (
    equipmentId: string,
    imageId: string,
    request: UpdateEquipmentImageRequest
  ): Promise<EquipmentImage> => {
    const response = await apiClient.patch<EquipmentImage>(
      `/equipment/${equipmentId}/images/${imageId}`,
      request
    );
    return response.data;
  },

  reorder: async (equipmentId: string, orderedIds: string[]): Promise<EquipmentImage[]> => {
    const response = await apiClient.post<EquipmentImage[]>(
      `/equipment/${equipmentId}/images/reorder`,
      { orderedIds }
    );
    return response.data;
  },

  delete: async (equipmentId: string, imageId: string): Promise<void> => {
    await apiClient.delete(`/equipment/${equipmentId}/images/${imageId}`);
  },
};

// ========== PARTS INVENTORY ==========
// Lives on inventory-service (formerly equipment-service) at /api/v1/inventory/*.

export interface PartsInventory {
  id: string;
  tenantId: string;
  warehouseId: string;
  warehouseName?: string;
  partNumber: string;
  partName: string;
  manufacturerId?: string;
  manufacturerName?: string;
  quantityOnHand: number;
  reorderPoint: number;
  reorderQuantity: number;
  unitCost?: number;
  locationBin?: string;
  needsReorder: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartsInventoryRequest {
  warehouseId: string;
  partNumber: string;
  partName: string;
  manufacturerId?: string;
  quantityOnHand?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost?: number;
  locationBin?: string;
  notes?: string;
}

export interface UpdatePartsInventoryRequest {
  partName?: string;
  manufacturerId?: string;
  quantityOnHand?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost?: number;
  locationBin?: string;
  notes?: string;
}

export interface AdjustQuantityRequest {
  adjustment: number;
}

export const partsInventoryApi = {
  getAll: async (warehouseId?: string, needsReorder?: boolean): Promise<PartsInventory[]> => {
    const params: Record<string, string | boolean> = {};
    if (warehouseId) params.warehouseId = warehouseId;
    if (needsReorder !== undefined) params.needsReorder = needsReorder;
    const response = await apiClient.get<PartsInventory[]>('/inventory/parts-inventory', { params });
    return response.data;
  },

  getById: async (id: string): Promise<PartsInventory> => {
    const response = await apiClient.get<PartsInventory>(`/inventory/parts-inventory/${id}`);
    return response.data;
  },

  create: async (request: CreatePartsInventoryRequest): Promise<PartsInventory> => {
    const response = await apiClient.post<PartsInventory>('/inventory/parts-inventory', request);
    return response.data;
  },

  update: async (id: string, request: UpdatePartsInventoryRequest): Promise<PartsInventory> => {
    const response = await apiClient.put<PartsInventory>(`/inventory/parts-inventory/${id}`, request);
    return response.data;
  },

  adjustQuantity: async (id: string, adjustment: number): Promise<PartsInventory> => {
    const response = await apiClient.post<PartsInventory>(
      `/inventory/parts-inventory/${id}/adjust-quantity`,
      { adjustment }
    );
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/inventory/parts-inventory/${id}`);
  },
};

// ========== WAREHOUSES ==========

export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export const WarehouseStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  managerName?: string;
  phone?: string;
  status: WarehouseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseRequest {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  managerName?: string;
  phone?: string;
}

export interface UpdateWarehouseRequest {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  managerName?: string;
  phone?: string;
  status?: WarehouseStatus;
}

export const warehousesApi = {
  getAll: async (): Promise<Warehouse[]> => {
    const response = await apiClient.get<Warehouse[]>('/inventory/warehouses');
    return response.data;
  },

  getById: async (id: string): Promise<Warehouse> => {
    const response = await apiClient.get<Warehouse>(`/inventory/warehouses/${id}`);
    return response.data;
  },

  create: async (request: CreateWarehouseRequest): Promise<Warehouse> => {
    const response = await apiClient.post<Warehouse>('/inventory/warehouses', request);
    return response.data;
  },

  update: async (id: string, request: UpdateWarehouseRequest): Promise<Warehouse> => {
    const response = await apiClient.put<Warehouse>(`/inventory/warehouses/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/inventory/warehouses/${id}`);
  },
};

// Combined export for convenience
export const allEquipmentApis = {
  equipment: equipmentApi,
  equipmentTypes: equipmentTypesApi,
  equipmentCategories: equipmentCategoriesApi,
  equipmentFilters: equipmentFiltersApi,
  equipmentImages: equipmentImagesApi,
  tenantFilterSizes: tenantFilterSizesApi,
  reports: reportsApi,
  partsInventory: partsInventoryApi,
  warehouses: warehousesApi,
};

export default allEquipmentApis;
