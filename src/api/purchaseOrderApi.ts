// Purchase Orders + Vendors — inventory-service (/api/v1/inventory/*).
// Powers the Work Order "Purchasing" tab: list a WO's POs, create/edit them,
// pick/create vendors, and (AI-gated) pre-fill from a scanned receipt.
//
// Per FE_HANDOFF_wo_purchasing_tab.md, deliberately NOT modeled here (backend
// doesn't have them yet): a receive action / stock posting, PO delete, a
// PO→WO cost rollup, a parts-catalog link on lines, approvals. Money is
// cost-only; `billPrice` is a stored suggestion, not yet carried to a document.
import apiClient from './client';
import type { Page } from './workOrderApi';

// FIELD = counter run · ORDER = special order · STOCK = no job.
export type PurchaseOrderType = 'FIELD' | 'ORDER' | 'STOCK';
// Free set on the backend (no state machine) — a plain status dropdown.
export type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'BILLED';
// Only acts on the not-yet-built receive flow — safe to default UNTRACKED.
export type InventoryMode = 'TRACKED' | 'UNTRACKED';

// Row shape for the tab's summary table.
export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  vendorId: string | null;
  vendorName: string;
  type: PurchaseOrderType;
  status: PurchaseOrderStatus;
  workOrderId: string | null;
  eta?: string | null;
  createdAt: string;
  itemCount: number;
  totalCost: number;
}

export interface PurchaseOrderLine {
  id: string;
  name: string;
  sku?: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  // Optional suggested sell price stored on the line; not yet carried to a quote.
  billPrice?: number | null;
  lineCost: number; // unitCost × quantityOrdered
}

export interface PurchaseOrderResponse {
  id: string;
  poNumber: string;
  vendorId: string | null;
  vendorName: string;
  type: PurchaseOrderType;
  status: PurchaseOrderStatus;
  workOrderId: string | null;
  workItemId?: string | null;
  inventoryMode: InventoryMode;
  stockLocationId?: string | null;
  // Method label only ("Paid at counter" / "Company account" / "Net 30") — never card data.
  paymentMethod?: string | null;
  taxRate?: number | null;
  eta?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLine[];
  subtotalCost: number;
  taxAmount: number;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

// A line on create/patch. Omit id for new lines; PATCH `lines` replaces the set.
export interface PurchaseOrderLineInput {
  name: string;
  sku?: string | null;
  quantityOrdered: number;
  unitCost: number;
  billPrice?: number | null;
}

export interface CreatePurchaseOrderRequest {
  workOrderId?: string | null;
  workItemId?: string | null;
  type: PurchaseOrderType;
  // Supply one: an existing vendorId, or a vendorName (reused/auto-created).
  vendorId?: string;
  vendorName?: string;
  status?: PurchaseOrderStatus;
  inventoryMode?: InventoryMode;
  stockLocationId?: string | null;
  // Method label only, never card data (see FE_HANDOFF_procurement.md).
  paymentMethod?: string | null;
  taxRate?: number;
  eta?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLineInput[];
}

// PATCH is set-only (fields you send are applied; you can't null a field back
// out). Omit `lines` to leave them; send the full array to replace the set.
export interface UpdatePurchaseOrderRequest {
  vendorId?: string;
  vendorName?: string;
  status?: PurchaseOrderStatus;
  inventoryMode?: InventoryMode;
  stockLocationId?: string | null;
  paymentMethod?: string | null;
  taxRate?: number;
  eta?: string | null;
  notes?: string | null;
  lines?: PurchaseOrderLineInput[];
}

export interface Vendor {
  id: string;
  name: string;
  accountNumber?: string | null;
  paymentTerms?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface CreateVendorRequest {
  name: string;
  accountNumber?: string | null;
  paymentTerms?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

// Stateless receipt-scan pre-fill (AItenant-gated → 403 when off).
export interface ReceiptExtractionLine {
  name: string;
  quantity: number;
  unitCost?: number | null;
}
export interface ReceiptExtractionResult {
  vendorName?: string | null;
  lines: ReceiptExtractionLine[];
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  warnings: string[];
}

interface ListPurchaseOrdersParams {
  workOrderId?: string;
  workItemId?: string;
  status?: PurchaseOrderStatus;
  type?: PurchaseOrderType;
  page?: number;
  size?: number;
}

export const purchaseOrderApi = {
  list: async (params: ListPurchaseOrdersParams = {}): Promise<Page<PurchaseOrderListItem>> => {
    const response = await apiClient.get<Page<PurchaseOrderListItem>>('/inventory/purchase-orders', {
      params,
    });
    return response.data;
  },

  getById: async (id: string): Promise<PurchaseOrderResponse> => {
    const response = await apiClient.get<PurchaseOrderResponse>(`/inventory/purchase-orders/${id}`);
    return response.data;
  },

  create: async (request: CreatePurchaseOrderRequest): Promise<PurchaseOrderResponse> => {
    const response = await apiClient.post<PurchaseOrderResponse>('/inventory/purchase-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdatePurchaseOrderRequest): Promise<PurchaseOrderResponse> => {
    const response = await apiClient.patch<PurchaseOrderResponse>(
      `/inventory/purchase-orders/${id}`,
      request,
    );
    return response.data;
  },

  // Multipart receipt upload → suggested fields (creates no PO). Callers must
  // handle 403 (AI off / not opted in) by falling back to manual entry.
  scanReceipt: async (file: File): Promise<ReceiptExtractionResult> => {
    const form = new FormData();
    form.append('file', file);
    const response = await apiClient.post<ReceiptExtractionResult>(
      '/inventory/purchase-orders/scan-receipt',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },
};

export const vendorApi = {
  search: async (q?: string): Promise<Vendor[]> => {
    const response = await apiClient.get<Vendor[]>('/inventory/vendors', {
      params: q ? { q } : undefined,
    });
    return response.data;
  },

  create: async (request: CreateVendorRequest): Promise<Vendor> => {
    const response = await apiClient.post<Vendor>('/inventory/vendors', request);
    return response.data;
  },
};

export default purchaseOrderApi;
