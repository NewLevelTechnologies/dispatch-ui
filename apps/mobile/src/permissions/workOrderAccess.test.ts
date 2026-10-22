import { isAssignedOnly, workOrderAccess } from './workOrderAccess';

const user = (capabilities: string[], id = 'me') => ({ id, capabilities });

describe('isAssignedOnly', () => {
  it('is true for the Technician shape — assigned-only view, no view-all', () => {
    expect(isAssignedOnly(user(['VIEW_ASSIGNED_WORK_ORDERS']))).toBe(true);
  });

  it('is false once the user can see everything', () => {
    expect(isAssignedOnly(user(['VIEW_ASSIGNED_WORK_ORDERS', 'VIEW_ALL_WORK_ORDERS']))).toBe(false);
  });

  it('is false with no capabilities at all, and for an unresolved user', () => {
    expect(isAssignedOnly(user([]))).toBe(false);
    expect(isAssignedOnly(undefined)).toBe(false);
  });
});

describe('workOrderAccess', () => {
  it('denies everything while the user is still loading', () => {
    expect(workOrderAccess(undefined, 'me').canEdit).toBe(false);
  });

  it('denies a user with no capabilities, even on their own dispatch', () => {
    expect(workOrderAccess(user([]), 'me').canEdit).toBe(false);
  });

  it('allows EDIT_ALL_WORK_ORDERS regardless of who the dispatch belongs to', () => {
    expect(workOrderAccess(user(['EDIT_ALL_WORK_ORDERS']), 'someone-else').canEdit).toBe(true);
  });

  it('allows EDIT_ASSIGNED_WORK_ORDERS on the user’s own dispatch', () => {
    expect(workOrderAccess(user(['EDIT_ASSIGNED_WORK_ORDERS']), 'me').canEdit).toBe(true);
  });

  it('denies EDIT_ASSIGNED_WORK_ORDERS on someone else’s dispatch', () => {
    expect(workOrderAccess(user(['EDIT_ASSIGNED_WORK_ORDERS']), 'someone-else').canEdit).toBe(false);
  });

  it('treats an assigned-only viewer as assigned — seeing it is proof enough', () => {
    const technician = user(['VIEW_ASSIGNED_WORK_ORDERS', 'EDIT_ASSIGNED_WORK_ORDERS']);
    expect(workOrderAccess(technician, 'someone-else').canEdit).toBe(true);
  });

  it('denies EDIT_ASSIGNED_WORK_ORDERS when the assignee is unknown', () => {
    expect(workOrderAccess(user(['EDIT_ASSIGNED_WORK_ORDERS']), null).canEdit).toBe(false);
    expect(workOrderAccess(user(['EDIT_ASSIGNED_WORK_ORDERS'])).canEdit).toBe(false);
  });
});

// DELIBERATE FAILURE — proving CI actually gates mobile tests. To be reverted.
describe('CI falsification probe', () => {
  it('fails on purpose', () => {
    expect(workOrderAccess(undefined, 'me').canEdit).toBe(true);
  });
});
