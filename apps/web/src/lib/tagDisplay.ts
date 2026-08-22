// Tag filter chip display value: name for 1, "name1, name2" for 2, "N selected"
// for 3+. Shared by the Customers and Payers list tag filters (FilterChipListbox
// displayValue). Kept framework-agnostic — takes the i18n `t` so callers own the
// translation context.
export function formatTagDisplayValue(
  ids: string[],
  list: { id: string; name: string }[],
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (ids.length === 0) return null;
  const lookup = (id: string) => list.find((x) => x.id === id)?.name ?? id;
  if (ids.length === 1) return lookup(ids[0]);
  if (ids.length === 2) return ids.map(lookup).join(', ');
  return t('common.selectedCount', { count: ids.length });
}
