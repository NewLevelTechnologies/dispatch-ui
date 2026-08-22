// Per-WO work-item chip label, e.g. "WI-01". `sequence` is the backend's
// 1-based per-work-order line number; `abbrev` is the tenant's effective
// work_item glossary abbreviation (getAbbrev('work_item')), not a hardcoded
// "WI". Global machine identity stays the work item's UUID.
export function workItemLabel(abbrev: string, sequence: number): string {
  return `${abbrev}-${String(sequence).padStart(2, '0')}`;
}
