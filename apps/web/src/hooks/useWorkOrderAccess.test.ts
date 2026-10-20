import { describe, it, expect } from 'vitest';
import { workOrderAccess } from './useWorkOrderAccess';

const user = (capabilities: string[]) => ({ id: 'me', capabilities });
const assignedTo = (...ids: string[]) => ({
  assignedUsers: ids.map((userId) => ({ userId, name: null, state: 'SCHEDULED' as const })),
});

describe('workOrderAccess', () => {
  it('gives dispatch-style roles everything', () => {
    const a = workOrderAccess(
      user(['VIEW_ALL_WORK_ORDERS', 'CREATE_WORK_ORDERS', 'EDIT_ALL_WORK_ORDERS', 'CANCEL_WORK_ORDERS']),
      assignedTo('someone-else'),
    );
    expect(a).toEqual({ canCreate: true, canEdit: true, canEditAll: true, canCancel: true, canViewAll: true });
  });

  it('lets a technician edit the jobs they can see, and nothing more', () => {
    // Assigned-only viewers only ever see their own jobs, so no assignedUsers check.
    const a = workOrderAccess(user(['VIEW_ASSIGNED_WORK_ORDERS', 'EDIT_ASSIGNED_WORK_ORDERS']), {});
    expect(a).toEqual({ canCreate: false, canEdit: true, canEditAll: false, canCancel: false, canViewAll: false });
  });

  it('checks assignment when edit-assigned is paired with view-all', () => {
    const caps = user(['VIEW_ALL_WORK_ORDERS', 'EDIT_ASSIGNED_WORK_ORDERS']);
    expect(workOrderAccess(caps, assignedTo('me')).canEdit).toBe(true);
    expect(workOrderAccess(caps, assignedTo('someone-else')).canEdit).toBe(false);
    expect(workOrderAccess(caps, undefined).canEdit).toBe(false);
  });

  it('leaves view-only roles (Billing Clerk, Sales) read-only', () => {
    const a = workOrderAccess(user(['VIEW_ALL_WORK_ORDERS']), assignedTo('me'));
    expect(a.canEdit).toBe(false);
    expect(a.canEditAll).toBe(false);
    expect(a.canViewAll).toBe(true);
  });

  it('grants nothing before the user loads', () => {
    expect(Object.values(workOrderAccess(undefined)).every((v) => v === false)).toBe(true);
  });
});
