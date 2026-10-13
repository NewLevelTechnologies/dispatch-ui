import { useTranslation } from '@dispatch/i18n';
import type { PricebookCategory, PricebookCategoryRequest, PricebookItem, PricebookItemRequest } from '../../api/setup';
import { errorCode, extractApiError } from '../../lib/toast';

export const CATEGORIES_KEY = ['pricebook-categories'] as const;
export const ITEMS_KEY = ['pricebook-items'] as const;

/** The whole item with a change applied; an edit replaces it, so everything goes back with its version. */
export const toItemRequest = (item: PricebookItem, change: Partial<PricebookItemRequest> = {}): PricebookItemRequest => ({
  version: item.version,
  itemType: item.itemType,
  feeRole: item.feeRole,
  name: item.name,
  sku: item.sku,
  categoryId: item.categoryId,
  unit: item.unit,
  taxClass: item.taxClass,
  pricingMode: item.pricingMode,
  unitPrice: item.unitPrice,
  unitCost: item.unitCost,
  markupPct: item.markupPct,
  laborHours: item.laborHours,
  materialsCost: item.materialsCost,
  active: item.active,
  ...change,
});

export const toCategoryRequest = (c: PricebookCategory, change: Partial<PricebookCategoryRequest> = {}): PricebookCategoryRequest => ({
  name: c.name,
  parentId: c.parentId,
  sortOrder: c.sortOrder,
  active: c.active,
  ...change,
});

/** Words a pricebook write failure from its `code`. */
export function usePricebookError() {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    switch (code) {
      case 'STALE_VERSION':
      case 'SKU_TAKEN':
      case 'NAME_TAKEN':
      case 'CATEGORY_IN_USE':
        return t(`settings.pricebook.errors.${code}`);
      default:
        return extractApiError(err) ?? t('settings.pricebook.errors.generic');
    }
  };
}
