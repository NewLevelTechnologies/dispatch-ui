// Canonical purchase-order status display — one source for the label, pill tone,
// and dot rule across every PO surface (Purchasing list, WO Purchasing tab, PO
// detail, vendor PO history). Per the designer's PurStatus spec:
//   Received            → success, no dot
//   Ordered / Partially → warning, leading dot ("in flight / needs attention")
//   Draft / Billed / Cancelled → neutral, no dot   (Billed is intentionally NOT a 4th color)
import type { PurchaseOrderStatus, PurchaseOrderType } from '../api/setup';

export const PO_TYPE_LABEL: Record<PurchaseOrderType, string> = {
  FIELD: 'Field purchase',
  ORDER: 'Special order',
  STOCK: 'Stock',
};

// Subset of the Pill tones we use for PO status.
export type PoStatusTone = 'success' | 'warning' | 'neutral';

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  BILLED: 'Billed',
  CANCELLED: 'Cancelled',
};

export const PO_STATUS_TONE: Record<PurchaseOrderStatus, PoStatusTone> = {
  DRAFT: 'neutral',
  ORDERED: 'warning',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'neutral',
  CANCELLED: 'neutral',
};

// Dot only on the in-flight (warning) statuses.
export const poStatusHasDot = (status: PurchaseOrderStatus): boolean => PO_STATUS_TONE[status] === 'warning';
