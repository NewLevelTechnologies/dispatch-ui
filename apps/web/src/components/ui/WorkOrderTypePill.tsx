// Small colored chip for a work-order type. Tinted background + accent text,
// using the type's configured accent (`roleAccent` falls back to a name hash
// when accentId is absent, so the chip is always colored — never a flat grey).
// Shared so the type reads identically on every work-order list (equipment
// service history, location/customer WO cards, etc.).
//
// The accent is dynamic per type, so it's passed to CSS via the
// `--wo-type-accent` custom property; the `.wo-type-pill` class (components.css)
// turns it into the light/dark tint + text treatment (dark mode brightens it).
import type { CSSProperties } from 'react';
import { roleAccent } from '@dispatch/utils';

export function WorkOrderTypePill({
  type,
  className,
}: {
  type: { name: string | null | undefined; accentId?: string | null } | null | undefined;
  className?: string;
}) {
  if (!type?.name) return null;
  const accent = roleAccent(type.accentId ?? null, type.name);
  return (
    <span
      className={[
        'wo-type-pill inline-flex items-center whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-semibold',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--wo-type-accent': accent } as CSSProperties}
    >
      {type.name}
    </span>
  );
}
