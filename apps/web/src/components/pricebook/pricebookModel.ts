import type { PricebookCategory, PricebookItem, PricebookItemType, TaxClass } from '../../api/setup';

export const ITEM_TYPES: PricebookItemType[] = ['SERVICE', 'MATERIAL', 'EQUIPMENT', 'FEE'];

/** The tax class an item takes unless it overrides it. */
export const DEFAULT_TAX_CLASS: Record<PricebookItemType, TaxClass> = {
  SERVICE: 'LABOR',
  MATERIAL: 'MATERIALS',
  EQUIPMENT: 'EQUIPMENT',
  FEE: 'FEE',
};

/** A category in tree order, with its depth (0 = top level). */
export interface CategoryNode {
  category: PricebookCategory;
  level: number;
}

/**
 * Categories flattened depth-first, siblings by sortOrder then name. A
 * category whose parent is missing (or filtered out) sits at the top level.
 */
export function categoryTree(categories: PricebookCategory[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id));
  const children = new Map<string | null, PricebookCategory[]>();
  for (const c of categories) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  const out: CategoryNode[] = [];
  const walk = (parent: string | null, level: number, seen: Set<string>) => {
    const kids = (children.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const c of kids) {
      if (seen.has(c.id)) continue; // a cycle would otherwise never end
      seen.add(c.id);
      out.push({ category: c, level });
      walk(c.id, level + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** The category and everything under it, for "can't be its own parent". */
export function descendantIds(categories: PricebookCategory[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Margin on the list price as a whole percent; null without a price and a cost. */
export const itemMargin = (price: number | null, cost: number | null) =>
  price && cost != null ? Math.round(((price - cost) / price) * 100) : null;

/** What a computed item's price comes to from its inputs and the Regular rate; null while the rate isn't set. */
export function computedPrice(hours: number, regularRate: number | null, materialsCost: number, markupPct: number) {
  if (regularRate == null) return null;
  const labor = round2(hours * regularRate);
  const materials = round2(materialsCost * (1 + markupPct));
  return { labor, materials, price: round2(labor + materials) };
}

/** What a marked-up item's price comes to. */
export const markupPrice = (cost: number, markupPct: number) => round2(cost * (1 + markupPct));

/** Whole percent from a fraction, without float noise: 0.35 → 35. */
export const toPercent = (fraction: number | null | undefined) =>
  fraction == null ? null : parseFloat((fraction * 100).toFixed(4));

/** A fraction from a typed whole percent: 35 → 0.35. */
export const fromPercent = (percent: number) => Math.round(percent * 10000) / 1000000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** True when the item still can't be billed (a computed item while the Regular rate is unset). */
export const isUnpriced = (item: Pick<PricebookItem, 'unitPrice'>) => item.unitPrice == null;
