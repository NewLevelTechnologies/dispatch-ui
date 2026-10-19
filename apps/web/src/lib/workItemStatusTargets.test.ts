import { describe, it, expect } from 'vitest';
import type { WorkItemStatus, WorkflowTransition } from '../api/setup';
import { allowedTargetStatuses, completeTarget, partsArrivedTarget, reopenTarget } from './workItemStatusTargets';

const status = (id: string, code: string, statusCategory: WorkItemStatus['statusCategory'], sortOrder: number) =>
  ({ id, code, name: code, statusCategory, sortOrder, isActive: true }) as WorkItemStatus;

const NEW = status('s-new', 'NEW', 'NOT_STARTED', 1);
const WIP = status('s-wip', 'IN_PROGRESS', 'IN_PROGRESS', 2);
const PARTS = status('s-parts', 'PENDING_PARTS', 'BLOCKED', 3);
const ARRIVED = status('s-arrived', 'PARTS_ARRIVED', 'AWAITING_SCHEDULE', 4);
const DONE = status('s-done', 'COMPLETE', 'COMPLETED', 5);
const ALL = [NEW, WIP, PARTS, ARRIVED, DONE];

describe('allowedTargetStatuses', () => {
  it('allows every other active status when the workflow is not enforced', () => {
    expect(allowedTargetStatuses({ statusId: 's-new' }, ALL, [], false).map((s) => s.id)).toEqual([
      's-wip',
      's-parts',
      's-arrived',
      's-done',
    ]);
  });

  it('allows only defined transitions when enforced', () => {
    const transitions = [{ fromStatusId: 's-parts', toStatusId: 's-arrived' }] as WorkflowTransition[];
    expect(allowedTargetStatuses({ statusId: 's-parts' }, ALL, transitions, true).map((s) => s.id)).toEqual([
      's-arrived',
    ]);
  });
});

describe('targets', () => {
  it('finds the complete and parts-arrived statuses by seeded code', () => {
    expect(completeTarget(ALL)?.id).toBe('s-done');
    expect(partsArrivedTarget(ALL)?.id).toBe('s-arrived');
    expect(partsArrivedTarget([NEW, WIP])).toBeNull();
  });

  it('reopens to the previous status when the workflow still allows it', () => {
    expect(reopenTarget([NEW, WIP, PARTS], 's-parts')?.id).toBe('s-parts');
  });

  it('otherwise reopens to the first in-progress status', () => {
    expect(reopenTarget([NEW, WIP], null)?.id).toBe('s-wip');
    expect(reopenTarget([NEW, WIP], 's-gone')?.id).toBe('s-wip');
    expect(reopenTarget([DONE], null)).toBeNull();
  });
});
