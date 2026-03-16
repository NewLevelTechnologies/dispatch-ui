// Equipment API Client
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://dev.api.dispatch.newleveltech.net/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to all requests
api.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    } catch (error) {
      console.error('Error fetching auth session:', error);
      return Promise.reject(error);
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ========== EQUIPMENT ==========

export type EquipmentStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';

export const EquipmentStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED',
} as const;

export interface Equipment {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  manufacturerId?: string;
  manufacturerName?: string;
  equipmentType: string;
  modelNumber?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  location?: string;
  status: EquipmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentRequest {
  customerId: string;
  manufacturerId?: string;
  equipmentType: string;
  modelNumber?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  location?: string;
  notes?: string;
}

export interface UpdateEquipmentRequest {
  manufacturerId?: string;
  equipmentType?: string;
  modelNumber?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  location?: string;
  status?: EquipmentStatus;
  notes?: string;
}

export const equipmentApi = {
  getAll: async (customerId?: string): Promise<Equipment[]> => {
    const params = customerId ? { customerId } : {};
    const response = await api.get<Equipment[]>('/equipment', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Equipment> => {
    const response = await api.get<Equipment>(`/equipment/${id}`);
    return response.data;
  },

  create: async (request: CreateEquipmentRequest): Promise<Equipment> => {
    const response = await api.post<Equipment>('/equipment', request);
    return response.data;
  },

  update: async (id: string, request: UpdateEquipmentRequest): Promise<Equipment> => {
    const response = await api.put<Equipment>(`/equipment/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/equipment/${id}`);
  },
};

// ========== PARTS INVENTORY ==========

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
    const response = await api.get<PartsInventory[]>('/equipment/parts-inventory', { params });
    return response.data;
  },

  getById: async (id: string): Promise<PartsInventory> => {
    const response = await api.get<PartsInventory>(`/equipment/parts-inventory/${id}`);
    return response.data;
  },

  create: async (request: CreatePartsInventoryRequest): Promise<PartsInventory> => {
    const response = await api.post<PartsInventory>('/equipment/parts-inventory', request);
    return response.data;
  },

  update: async (id: string, request: UpdatePartsInventoryRequest): Promise<PartsInventory> => {
    const response = await api.put<PartsInventory>(`/equipment/parts-inventory/${id}`, request);
    return response.data;
  },

  adjustQuantity: async (id: string, adjustment: number): Promise<PartsInventory> => {
    const response = await api.post<PartsInventory>(
      `/equipment/parts-inventory/${id}/adjust-quantity`,
      { adjustment }
    );
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/equipment/parts-inventory/${id}`);
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
    const response = await api.get<Warehouse[]>('/equipment/warehouses');
    return response.data;
  },

  getById: async (id: string): Promise<Warehouse> => {
    const response = await api.get<Warehouse>(`/equipment/warehouses/${id}`);
    return response.data;
  },

  create: async (request: CreateWarehouseRequest): Promise<Warehouse> => {
    const response = await api.post<Warehouse>('/equipment/warehouses', request);
    return response.data;
  },

  update: async (id: string, request: UpdateWarehouseRequest): Promise<Warehouse> => {
    const response = await api.put<Warehouse>(`/equipment/warehouses/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/equipment/warehouses/${id}`);
  },
};

// Export combined API
export const allEquipmentApis = {
  equipment: equipmentApi,
  partsInventory: partsInventoryApi,
  warehouses: warehousesApi,
};

export default allEquipmentApis;
