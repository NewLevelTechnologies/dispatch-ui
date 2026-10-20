import type { WorkOrderFile } from '@dispatch/api';

/** Groups a flat file list by `workItemId` — `null`/unset lands under the `'unscoped'` key (general WO-level photos). */
export function groupFilesByWorkItem(files: WorkOrderFile[]): Map<string, WorkOrderFile[]> {
  const groups = new Map<string, WorkOrderFile[]>();
  for (const file of files) {
    const key = file.workItemId ?? 'unscoped';
    const existing = groups.get(key);
    if (existing) existing.push(file);
    else groups.set(key, [file]);
  }
  return groups;
}
