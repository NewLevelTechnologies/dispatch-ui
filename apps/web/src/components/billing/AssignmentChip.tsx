import { ChipListboxOption, FilterChipListbox } from '../ui/FilterChipListbox';

/** A chip's value for "has none" (no work order, location or setting). */
export const UNASSIGNED = 'none';

/**
 * A division, work-order type or region filter: one id, or "none". The
 * Revenue report's drill-ins land here with one already set.
 */
export function AssignmentChip({
  label,
  value,
  options,
  unassignedLabel,
  anyLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  unassignedLabel: string;
  anyLabel: string;
  onChange: (value: string | null) => void;
}) {
  const display = value === UNASSIGNED ? unassignedLabel : (options.find((o) => o.id === value)?.name ?? null);
  return (
    <FilterChipListbox
      label={label}
      ariaLabel={label}
      value={value || null}
      displayValue={value ? display : null}
      onChange={onChange}
      onClear={() => onChange(null)}
      resetLabel={anyLabel}
    >
      {options.map((o) => (
        <ChipListboxOption key={o.id} value={o.id}>
          {o.name}
        </ChipListboxOption>
      ))}
      <ChipListboxOption value={UNASSIGNED}>{unassignedLabel}</ChipListboxOption>
    </FilterChipListbox>
  );
}
