import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '../api/setup';
import { buildWorkOrderDays, type WoSingleRow } from './workOrderActivityRows';

const t = (key: string, params: Record<string, unknown> = {}) =>
  `${key.split('.').pop()}(${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;
const getName = (code: string, plural?: boolean) => (plural ? `${code}s` : code);
const getAbbrev = () => 'WI';

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'e',
  kind: 'NOTE_ADDED',
  category: 'DISPATCH',
  classification: 'BUSINESS',
  timestamp: '2026-05-14T18:00:00Z',
  subject: { type: 'DISPATCH', id: 'd-1', number: 1, label: null },
  actor: { type: 'USER', userId: 'u', userName: 'D. Park' },
  data: {},
  ...over,
});
const rows = (events: ActivityEvent[]) =>
  buildWorkOrderDays({ events, audit: [], t, getName, getAbbrev }).flatMap((d) => d.rows) as WoSingleRow[];

describe('buildWorkOrderDays', () => {
  it('says how many photos or files were uploaded', () => {
    const [photos] = rows([event({ kind: 'FILES_UPLOADED', data: { count: 6, photoCount: 6 } })]);
    expect(photos.text).toBe('filesUploaded(count=6,what=photos)');
    const [mixed] = rows([event({ kind: 'FILES_UPLOADED', data: { count: 1, photoCount: 0, documentCount: 1 } })]);
    expect(mixed.text).toBe('filesUploaded(count=1,what=file)');
  });

  it('folds a reschedule and a reassignment under their dispatch, oldest first', () => {
    const [row] = rows([
      event({ id: 'r2', kind: 'DISPATCH_REASSIGNED', classification: 'CHANGE', timestamp: '2026-05-14T18:00:00Z' }),
      event({
        id: 'r1',
        kind: 'DISPATCH_RESCHEDULED',
        timestamp: '2026-05-14T17:00:00Z',
        data: { arrivalWindowStart: '2026-05-15T19:00:00Z', arrivalWindowEnd: '2026-05-15T21:00:00Z' },
      }),
      event({ id: 'r0', kind: 'DISPATCH_ASSIGNED', timestamp: '2026-05-14T16:00:00Z' }),
    ]);
    expect(row.id).toBe('r2');
    expect(row.change).toBe(true);
    expect(row.obj).toBe('dispatch 1');
    expect(row.steps.map((s) => s.id)).toEqual(['r0', 'r1']);
    expect(row.steps[1].text).toMatch(/^dispatchRescheduled\(window=May 15, /);
  });

  it('names the customer when a view carries no name', () => {
    const [row] = rows([
      event({
        kind: 'QUOTE_VIEWED',
        category: 'FINANCIAL',
        subject: { type: 'QUOTE', id: 'q-1', number: null, label: 'Q-1' },
        actor: { type: 'CUSTOMER', userId: null, userName: '' },
        data: { revision: 1 },
      }),
    ]);
    expect(row.actor).toBe('customer');
    expect(row.isPerson).toBe(true);
    expect(row.text).toBe('quoteViewed(rev=)');
    expect(row.objHref).toBe('/quotes/q-1');
  });

  it('words a send with no channels as marked sent', () => {
    const [row] = rows([
      event({
        kind: 'INVOICE_SENT',
        category: 'FINANCIAL',
        subject: { type: 'INVOICE', id: 'i-1', number: null, label: 'INV-1' },
        data: { totalAmount: 389, channels: [] },
      }),
    ]);
    expect(row.text).toBe('invoiceMarkedSent(amount=$389.00)');
  });
});
