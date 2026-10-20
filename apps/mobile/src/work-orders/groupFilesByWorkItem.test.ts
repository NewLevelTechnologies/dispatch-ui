import { groupFilesByWorkItem } from './groupFilesByWorkItem';
import type { WorkOrderFile } from '@dispatch/api';

describe('groupFilesByWorkItem', () => {
  it('groups files under their work item id', () => {
    const a = { id: 'a', workItemId: 'wi1' } as WorkOrderFile;
    const b = { id: 'b', workItemId: 'wi1' } as WorkOrderFile;
    const c = { id: 'c', workItemId: 'wi2' } as WorkOrderFile;

    const groups = groupFilesByWorkItem([a, b, c]);

    expect(groups.get('wi1')?.map((f) => f.id)).toEqual(['a', 'b']);
    expect(groups.get('wi2')?.map((f) => f.id)).toEqual(['c']);
  });

  it('groups files with no work item under "unscoped"', () => {
    const a = { id: 'a', workItemId: null } as WorkOrderFile;

    const groups = groupFilesByWorkItem([a]);

    expect(groups.get('unscoped')?.map((f) => f.id)).toEqual(['a']);
  });

  it('returns an empty map for no files', () => {
    expect(groupFilesByWorkItem([]).size).toBe(0);
  });
});
