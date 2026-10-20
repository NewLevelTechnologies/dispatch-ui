import { describe, it, expect, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateDispatchBoard, invalidateRoleConsumers } from './invalidateRoleConsumers';

function stubClient() {
  const invalidateQueries = vi.fn();
  return { invalidateQueries } as unknown as QueryClient & {
    invalidateQueries: ReturnType<typeof vi.fn>;
  };
}

const keys = (qc: { invalidateQueries: ReturnType<typeof vi.fn> }) =>
  qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);

describe('invalidateDispatchBoard', () => {
  // One prefix covers both board reads — the grid and the unscheduled rail.
  it('invalidates the board by prefix', () => {
    const qc = stubClient();
    invalidateDispatchBoard(qc);
    expect(keys(qc)).toEqual([['dispatch-board']]);
  });
});

describe('invalidateRoleConsumers', () => {
  // A role carries performsFieldWork, so toggling it adds or removes every
  // holder from the board at once — the board is a role consumer.
  it('includes the dispatch board', () => {
    const qc = stubClient();
    invalidateRoleConsumers(qc);
    expect(keys(qc)).toContainEqual(['dispatch-board']);
  });

  it('still invalidates the caches that embed role data', () => {
    const qc = stubClient();
    invalidateRoleConsumers(qc, 'r1');
    expect(keys(qc)).toContainEqual(['roles']);
    expect(keys(qc)).toContainEqual(['roles', 'r1']);
    expect(keys(qc)).toContainEqual(['users']);
    expect(keys(qc)).toContainEqual(['currentUser']);
  });
});
