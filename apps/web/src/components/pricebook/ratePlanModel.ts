import type { PlanMarkupTier, RatePlan, RatePlanRequest } from '../../api/setup';
import { fromPercent, toPercent } from './pricebookModel';

/**
 * A markup tier as the form edits it: up to a cost (null = "and up" on the
 * last one) and a whole-percent markup. The API stores each tier's lower
 * bound instead, so these convert both ways.
 */
export interface TierRow {
  upTo: string;
  markup: string;
}

/** API tiers (lowest first, each from `minCost`) to form rows (each up to the next tier's `minCost`). */
export function tiersToRows(tiers: PlanMarkupTier[]): TierRow[] {
  const sorted = [...tiers].sort((a, b) => a.minCost - b.minCost);
  return sorted.map((t, i) => ({
    upTo: i < sorted.length - 1 ? String(sorted[i + 1].minCost) : '',
    markup: String(toPercent(t.markupPct) ?? 0),
  }));
}

/** Form rows back to API tiers: the first starts at $0, each next one where the last ended. */
export function rowsToTiers(rows: TierRow[]): PlanMarkupTier[] {
  return rows.map((r, i) => ({
    minCost: i === 0 ? 0 : Number(rows[i - 1].upTo),
    markupPct: fromPercent(Number(r.markup)),
  }));
}

/** Every bound but the last is a number above the one before; every markup is zero or more. */
export function tiersValid(rows: TierRow[]): boolean {
  let floor = 0;
  return rows.every((r, i) => {
    const markup = Number(r.markup);
    if (r.markup.trim() === '' || !Number.isFinite(markup) || markup < 0) return false;
    if (i === rows.length - 1) return true;
    const upTo = Number(r.upTo);
    if (r.upTo.trim() === '' || !Number.isFinite(upTo) || upTo <= floor) return false;
    floor = upTo;
    return true;
  });
}

/** The plan's overall adjustment as a signed whole percent: 0.9 → −10. */
export const adjustmentPercent = (multiplier: number | null) =>
  multiplier == null ? 0 : parseFloat(((multiplier - 1) * 100).toFixed(4));

/** A signed whole percent back to a multiplier; 0 means none. */
export const multiplierFrom = (percent: number) => (percent === 0 ? null : Math.round((1 + percent / 100) * 10000) / 10000);

/** The whole plan with a change applied; an edit replaces it, rules included. */
export const toPlanRequest = (plan: RatePlan, change: Partial<RatePlanRequest> = {}): RatePlanRequest => ({
  name: plan.name,
  description: plan.description ?? null,
  isDefault: plan.isDefault,
  priceMultiplier: plan.priceMultiplier,
  memberBenefitsStack: plan.memberBenefitsStack,
  active: plan.active,
  laborRates: plan.laborRates,
  markupTiers: plan.markupTiers,
  categoryMultipliers: plan.categoryMultipliers,
  ...change,
});
