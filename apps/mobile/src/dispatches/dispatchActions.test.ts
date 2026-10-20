import { canComplete, canMarkArrived, canMarkEnRoute } from './dispatchActions';
import type { DispatchStatus } from '@dispatch/api';

const ALL: DispatchStatus[] = ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

describe('canMarkEnRoute', () => {
  it('is only offered while scheduled', () => {
    expect(ALL.filter(canMarkEnRoute)).toEqual(['SCHEDULED']);
  });
});

describe('canMarkArrived', () => {
  it('is offered from scheduled (skip) or en route (expected)', () => {
    expect(ALL.filter(canMarkArrived)).toEqual(['SCHEDULED', 'EN_ROUTE']);
  });
});

describe('canComplete', () => {
  it('is the terminal escape hatch from any non-terminal state', () => {
    expect(ALL.filter(canComplete)).toEqual(['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS']);
  });
});
