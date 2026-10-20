import { describe, it, expect } from 'vitest';
import { adjustmentPercent, multiplierFrom, rowsToTiers, tiersToRows, tiersValid } from './ratePlanModel';

describe('ratePlanModel', () => {
  it('turns lower-bound tiers into "up to" rows and back', () => {
    const tiers = [
      { minCost: 250, markupPct: 0.25 },
      { minCost: 0, markupPct: 0.6 },
      { minCost: 50, markupPct: 0.4 },
    ];
    const rows = tiersToRows(tiers);
    expect(rows).toEqual([
      { upTo: '50', markup: '60' },
      { upTo: '250', markup: '40' },
      { upTo: '', markup: '25' },
    ]);
    expect(rowsToTiers(rows)).toEqual([
      { minCost: 0, markupPct: 0.6 },
      { minCost: 50, markupPct: 0.4 },
      { minCost: 250, markupPct: 0.25 },
    ]);
  });

  it('needs ranges that climb and a markup on every tier', () => {
    expect(tiersValid([{ upTo: '50', markup: '60' }, { upTo: '', markup: '30' }])).toBe(true);
    expect(tiersValid([{ upTo: '50', markup: '60' }, { upTo: '40', markup: '30' }, { upTo: '', markup: '20' }])).toBe(false);
    expect(tiersValid([{ upTo: '50', markup: '' }, { upTo: '', markup: '30' }])).toBe(false);
  });

  it('reads a multiplier as a signed percent', () => {
    expect(adjustmentPercent(0.9)).toBe(-10);
    expect(adjustmentPercent(null)).toBe(0);
    expect(multiplierFrom(-5)).toBe(0.95);
    expect(multiplierFrom(0)).toBeNull();
  });
});
