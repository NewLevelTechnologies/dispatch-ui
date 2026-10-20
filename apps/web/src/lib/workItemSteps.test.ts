import { describe, it, expect } from 'vitest';
import type { PurchaseOrderResponse, WorkItemDocument, WorkItemResponse } from '../api/setup';
import { deriveWorkItemSteps, primaryAction } from './workItemSteps';

const wi = (overrides: Partial<WorkItemResponse> = {}): WorkItemResponse => ({
  id: 'wi-1',
  statusId: 's-new',
  statusCategory: 'NOT_STARTED',
  description: 'No cooling',
  equipmentId: null,
  equipment: null,
  createdAt: '2026-05-14T13:40:00Z',
  updatedAt: '2026-05-14T13:40:00Z',
  ...overrides,
});

const po = (status: PurchaseOrderResponse['status'], overrides: Partial<PurchaseOrderResponse> = {}) =>
  ({ id: `po-${status}`, poNumber: 'PO-2104', status, eta: '2026-05-17', lines: [], ...overrides }) as PurchaseOrderResponse;

const states = (steps: ReturnType<typeof deriveWorkItemSteps>) => steps.map((s) => `${s.key}:${s.state}`);

describe('deriveWorkItemSteps', () => {
  it('has no Parts ready step when nothing was ordered, and Diagnosed is current on a fresh item', () => {
    expect(states(deriveWorkItemSteps(wi(), []))).toEqual(['reported:done', 'diagnosed:current', 'done:todo']);
  });

  it('omits Parts ready when the only PO was cancelled', () => {
    expect(states(deriveWorkItemSteps(wi({ diagnosis: 'x' }), [po('CANCELLED')]))).toEqual([
      'reported:done',
      'diagnosed:done',
      'done:current',
    ]);
  });

  it('blocks Parts ready on an open PO (with its number and ETA) and leaves Done untouched', () => {
    const steps = deriveWorkItemSteps(wi({ diagnosis: 'Blower out of balance' }), [po('ORDERED')]);
    expect(states(steps)).toEqual(['reported:done', 'diagnosed:done', 'partsReady:blocked', 'done:todo']);
    expect(steps[2].note).toEqual({ kind: 'po', poNumber: 'PO-2104', eta: '2026-05-17', more: 0 });
  });

  it('omits Parts ready on a Pending-parts item with no PO raised for it', () => {
    const steps = deriveWorkItemSteps(wi({ diagnosis: 'x', statusCategory: 'BLOCKED' }), []);
    expect(steps.map((s) => s.key)).toEqual(['reported', 'diagnosed', 'done']);
  });

  it('turns Parts ready green once every linked PO is received, and Done becomes current', () => {
    const steps = deriveWorkItemSteps(wi({ diagnosis: 'x', statusCategory: 'IN_PROGRESS' }), [
      po('RECEIVED'),
    ]);
    expect(states(steps)).toEqual(['reported:done', 'diagnosed:done', 'partsReady:done', 'done:current']);
  });

  it('has no current step on a completed item', () => {
    const steps = deriveWorkItemSteps(wi({ statusCategory: 'COMPLETED' }), []);
    expect(steps.some((s) => s.state === 'current')).toBe(false);
    expect(steps.at(-1)).toMatchObject({ state: 'done', note: { kind: 'complete' } });
  });

  it('shows a cancelled item as a skipped Done', () => {
    expect(deriveWorkItemSteps(wi({ statusCategory: 'CANCELLED' }), []).at(-1)?.state).toBe('skip');
  });
});

const quote = (status: string, overrides: Partial<WorkItemDocument> = {}): WorkItemDocument => ({
  workItemId: 'wi-1',
  documentType: 'QUOTE',
  documentId: `q-${status}`,
  number: 'Q-1903',
  status,
  amount: 420,
  declined: false,
  ...overrides,
});

describe('Approved step', () => {
  const diagnosed = wi({ diagnosis: 'x', statusCategory: 'IN_PROGRESS' });

  it('is absent when the item is on no quote', () => {
    expect(deriveWorkItemSteps(diagnosed, [], []).map((s) => s.key)).not.toContain('approved');
  });

  it('is done once an accepted quote sold the item, and sits before Parts ready', () => {
    const steps = deriveWorkItemSteps(diagnosed, [po('ORDERED')], [quote('ACCEPTED')]);
    expect(states(steps)).toEqual(['reported:done', 'diagnosed:done', 'approved:done', 'partsReady:blocked', 'done:todo']);
  });

  it('is current while the quote is out, with its number and status', () => {
    const steps = deriveWorkItemSteps(diagnosed, [], [quote('SENT')]);
    expect(steps[2]).toMatchObject({ key: 'approved', state: 'current', note: { kind: 'quote', number: 'Q-1903', status: 'SENT' } });
  });

  it('is blocked when the accepted quote left the item unsold, or it was declined', () => {
    expect(deriveWorkItemSteps(diagnosed, [], [quote('ACCEPTED', { declined: true })])[2]).toMatchObject({
      state: 'blocked',
      note: { kind: 'declined' },
    });
    expect(deriveWorkItemSteps(diagnosed, [], [quote('DECLINED')])[2].state).toBe('blocked');
  });

  it('ignores invoices', () => {
    const steps = deriveWorkItemSteps(diagnosed, [], [quote('PAID', { documentType: 'INVOICE' })]);
    expect(steps.map((s) => s.key)).not.toContain('approved');
  });
});

describe('primaryAction', () => {
  const base = {
    finished: false,
    awaitingParts: false,
    hasDispatches: true,
    hasFindings: true,
    canPartsArrived: true,
    canSchedule: true,
    canComplete: true,
  };

  it('is none when the item is done', () => {
    expect(primaryAction({ ...base, finished: true })).toBe('none');
  });
  it('is Parts arrived while awaiting parts', () => {
    expect(primaryAction({ ...base, awaitingParts: true, hasDispatches: false })).toBe('partsArrived');
  });
  it('is Schedule dispatch with no dispatches', () => {
    expect(primaryAction({ ...base, hasDispatches: false, hasFindings: false })).toBe('schedule');
  });
  it('is Add findings when scheduled but not diagnosed', () => {
    expect(primaryAction({ ...base, hasFindings: false })).toBe('findings');
  });
  it('is Mark complete otherwise', () => {
    expect(primaryAction(base)).toBe('complete');
  });
  it('falls back to none when the workflow allows no completion', () => {
    expect(primaryAction({ ...base, canComplete: false })).toBe('none');
  });
});
