import { describe, it, expect } from 'vitest';
import { getFieldLabel, getEventContext } from './activityFormatters';
import type { ActivityEvent } from '../api';

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
