import { describe, it, expect } from 'vitest';
import { getFieldLabel, getEventContext, resolveEventSummary } from './activityFormatters';
import type { ActivityEvent } from '../api/setup';

const makeEvent = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'evt-1',
  workOrderId: 'wo-1',
  category: 'STATUS',
  kind: 'WORK_ITEM_CREATED',
  data: {},
  occurredAt: '2026-05-01T12:00:00Z',
  actor: null,
  ...overrides,
} as ActivityEvent);

describe('getFieldLabel', () => {
  const t = (key: string) => key;
  const getName = (code: string) => (code === 'equipment' ? 'Equipment' : code === 'division' ? 'Division' : code);

  it('routes equipmentId through the glossary', () => {
    expect(getFieldLabel('equipmentId', t, getName)).toBe('Equipment');
  });

  it('routes divisionId through the glossary', () => {
    expect(getFieldLabel('divisionId', t, getName)).toBe('Division');
  });

  it('falls back to the raw field key when no mapping exists', () => {
    expect(getFieldLabel('madeUpField', t, getName)).toBe('madeUpField');
  });

  it('returns empty for empty field', () => {
    expect(getFieldLabel('', t, getName)).toBe('');
  });
});

describe('getEventContext', () => {
  it('prefers equipmentName for work-item events', () => {
    const event = makeEvent({
      kind: 'WORK_ITEM_CREATED',
      data: { equipmentName: 'Upstairs Furnace', workItemDescription: 'Replace filter' },
    });
    expect(getEventContext(event)).toBe('Upstairs Furnace');
  });

  it('falls back to workItemDescription when no equipmentName', () => {
    const event = makeEvent({
      kind: 'WORK_ITEM_UPDATED',
      data: { workItemDescription: 'Replace filter' },
    });
    expect(getEventContext(event)).toBe('Replace filter');
  });

  it('falls back to description as a last resort', () => {
    const event = makeEvent({
      kind: 'WORK_ITEM_STATUS_CHANGED',
      data: { description: 'Inspect coils' },
    });
    expect(getEventContext(event)).toBe('Inspect coils');
  });

  it('returns null for non-work-item events', () => {
    const event = makeEvent({ kind: 'NOTE_ADDED', data: {} });
    expect(getEventContext(event)).toBeNull();
  });
});

describe('callback events', () => {
  // A tiny stand-in for i18next: fill {{name}} from params.
  const t = (key: string, params: Record<string, unknown> = {}) =>
    ({
      'workOrders.activity.kind.callbackLinked': 'Linked as a callback of {{toWorkOrderNumber}}',
      'workOrders.activity.kind.callbackChanged': 'Callback changed from {{fromWorkOrderNumber}} to {{toWorkOrderNumber}}',
    })[key]?.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(params[k] ?? `{{${k}}}`)) ?? key;
  const getName = (code: string) => code;

  it('names the original job on link and change', () => {
    expect(
      resolveEventSummary(makeEvent({ kind: 'CALLBACK_LINKED', data: { toWorkOrderNumber: 'WO-1234' } }), t, getName),
    ).toBe('Linked as a callback of WO-1234');
    expect(
      resolveEventSummary(
        makeEvent({ kind: 'CALLBACK_CHANGED', data: { fromWorkOrderNumber: 'WO-1', toWorkOrderNumber: 'WO-2' } }),
        t,
        getName,
      ),
    ).toBe('Callback changed from WO-1 to WO-2');
  });
});

