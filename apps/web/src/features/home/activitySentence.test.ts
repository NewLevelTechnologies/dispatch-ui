import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '../../api/setup';
import { verbSentence } from './activitySentence';

const TEMPLATES: Record<string, string> = {
  'dashboard.activity.verb.workOrderCompleted': 'completed {{obj}}',
  'dashboard.activity.verb.dispatchArrived': 'arrived at {{obj}}',
  'dashboard.activity.verb.invoicePaid': 'paid {{obj}} in full · {{amount}}',
  'workOrders.activity.kind.workOrderCompleted': '{{entity}} completed',
  'workOrders.activity.kind.workOrderCreated': '{{entity}} created',
};

const t = (key: string, params: Record<string, unknown> = {}) => {
  const template = TEMPLATES[key];
  if (!template) return key;
  return template.replace(/{{(\w+)}}/g, (_, name: string) => (name in params ? String(params[name]) : `{{${name}}}`));
};
const getName = (code: string) => (code === 'work_order' ? 'Work Order' : code);

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'e',
  kind: 'WORK_ORDER_COMPLETED',
  category: 'STATUS',
  timestamp: '2026-10-21T15:00:00Z',
  actor: { type: 'USER', userId: 'u', userName: 'Marcus Bell' },
  data: {},
  ...over,
});

describe('verbSentence', () => {
  it('splits the verb template around the object', () => {
    expect(verbSentence(event({}), 'work', 'Marcus Bell', t, getName)).toEqual({ before: 'completed ', after: '' });
  });

  it('phrases a financial step with its amount after the object', () => {
    const paid = event({ kind: 'INVOICE_PAID', category: 'FINANCIAL', data: { totalAmount: 3860 } });
    expect(verbSentence(paid, 'financial', 'Ridgeview HOA', t, getName)).toEqual({
      before: 'paid ',
      after: ' in full · $3,860.00',
    });
  });

  it('returns null for a kind with no verb template, so the card falls back', () => {
    expect(verbSentence(event({ kind: 'WORK_ORDER_CREATED' }), 'work', 'Marcus Bell', t, getName)).toBeNull();
  });

  it('only credits a trip milestone to the tech it belongs to', () => {
    const arrived = event({ kind: 'DISPATCH_ARRIVED', category: 'DISPATCH', data: { assignedUserName: 'Grace Kim' } });
    expect(verbSentence(arrived, 'work', 'Grace Kim', t, getName)).toEqual({ before: 'arrived at ', after: '' });
    expect(verbSentence(arrived, 'work', 'Ana Ruiz', t, getName)).toBeNull();
  });
});
