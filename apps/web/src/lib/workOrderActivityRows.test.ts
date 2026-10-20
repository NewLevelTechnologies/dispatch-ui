import { describe, it, expect } from 'vitest';
import type { ActivityEvent, NotificationLogDto } from '../api/setup';
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

  it('names a deleted draft without linking it: the quote no longer loads', () => {
    const [row] = rows([
      event({
        kind: 'QUOTE_DELETED',
        category: 'FINANCIAL',
        subject: { type: 'QUOTE', id: 'q-9', number: null, label: 'Q-1990' },
        data: { totalAmount: 412 },
      }),
    ]);
    expect(row.text).toBe('quoteDeleted(amount=$412.00)');
    expect(row.obj).toBe('Q-1990');
    expect(row.objHref).toBeNull();
  });

  it('words a stretch of the customer choosing: where they went, what they added, where they left it', () => {
    const choice = (data: Record<string, unknown>) =>
      rows([event({ kind: 'QUOTE_CHOICE_CHANGED', category: 'FINANCIAL', subject: { type: 'QUOTE', id: 'q-1', number: null, label: 'Q-1907' }, data })])[0].text;
    expect(choice({ path: ['Comfort', 'Ultimate', 'Comfort'], added: ['Duct sealing'], removed: [], totalAmount: 17700 })).toBe(
      'quoteChoicePath(seen=Comfort, Ultimate,last=Comfort) · quoteChoiceAdded(list=Duct sealing) · $17,700.00',
    );
    expect(choice({ path: ['Comfort'], added: [], removed: ['Surge protector'], totalAmount: 15080 })).toBe(
      'quoteChoiceOn(last=Comfort) · quoteChoiceRemoved(list=Surge protector) · $15,080.00',
    );
    expect(choice({ path: ['Comfort'], added: [], removed: [] })).toBe('quoteChoiceSame(last=Comfort)');
  });

  it('flags a membership signed up for on a proposal', () => {
    const [row] = rows([event({ kind: 'QUOTE_MEMBERSHIP_SIGNUP', category: 'FINANCIAL', subject: { type: 'QUOTE', id: 'q-1', number: null, label: 'Q-1907' }, data: { planId: 'p', planName: 'Comfort Club' } })]);
    expect(row.text).toBe('quoteMembershipSignup(plan=Comfort Club)');
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

  it('says whether a text or email was delivered or bounced', () => {
    const msg = (status: NotificationLogDto['status']): NotificationLogDto => ({
      id: status,
      notificationId: 'n',
      notificationTypeId: 'nt',
      notificationTypeName: 'Invoice',
      channel: 'EMAIL',
      recipientName: 'Ops desk',
      status,
      entityType: 'invoice',
      entityId: 'i-1',
      about: null,
      createdAt: '2026-05-14T18:00:00Z',
      retryCount: 0,
    });
    const out = buildWorkOrderDays({ events: [], messages: [msg('DELIVERED'), msg('BOUNCED')], audit: [], t, getName, getAbbrev })
      .flatMap((d) => d.rows) as WoSingleRow[];
    expect(out.map((r) => r.text)).toEqual([
      'delivered(base=emailed(what=Invoice,recipient=Ops desk))',
      'bounced(base=emailed(what=Invoice,recipient=Ops desk))',
    ]);
    expect(out.map((r) => r.tone)).toEqual(['neutral', 'warning']);
  });
});
