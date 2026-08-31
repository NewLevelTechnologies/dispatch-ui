// ─────────────────────────────────────────────────────────────────
// PremiseMark.tsx — small icon chip identifying what a tech is
// walking into at a given LOCATION.
//
// House glyph for `RESIDENCE`, building glyph for `BUSINESS`. The mark
// is per-LOCATION (driven by `Location.premiseType`), never per-customer
// and NEVER inferred from address topology — a property-management
// company can own residential rental locations, and we have to be able
// to express that.
//
//   <PremiseMark premise="BUSINESS" />
//   <PremiseMark premise="RESIDENCE" title="Homeowner" />
//
// Used on the Locations list and Location detail surface only — it
// does not appear on the Customers list, because a customer can own a
// mix of premise types and there's no honest customer-level answer.
// ─────────────────────────────────────────────────────────────────
import { BuildingOffice2Icon, HomeIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

type Premise = 'BUSINESS' | 'RESIDENCE';

export function PremiseMark({
  premise,
  title,
  className,
  size = 'sm',
  ring,
}: {
  premise: Premise;
  title?: string;
  className?: string;
  // 'sm' — 22px subtle list chip (default). 'lg' — 52px saturated gradient
  // header mark (the detail-page mark; same premise hue map).
  size?: 'sm' | 'lg';
  // Optional priority ring on the lg mark (the WO header signals elevated
  // priority this way): 'danger' = Urgent, 'warning' = High. Omit for
  // Normal/Low — the fill alone carries premise; the ring carries urgency.
  ring?: 'danger' | 'warning';
}) {
  const business = premise === 'BUSINESS';
  const Icon = business ? BuildingOffice2Icon : HomeIcon;
  const label = title ?? (business ? 'Business' : 'Residence');

  if (size === 'lg') {
    // Ring hugs the glyph flush — no ring-offset gap (per the designer).
    const ringCls =
      ring === 'danger'
        ? 'ring-[3px] ring-danger-500'
        : ring === 'warning'
          ? 'ring-[3px] ring-warning-500'
          : '';
    return (
      <div
        title={label}
        aria-label={label}
        className={clsx(
          'grid size-[52px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.12)]',
          business
            ? 'from-info-500 to-[color-mix(in_oklch,var(--info-500)_70%,black)]'
            : 'from-success-500 to-[color-mix(in_oklch,var(--success-500)_70%,black)]',
          ringCls,
          className
        )}
      >
        <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      </div>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={clsx(
        // One premise hue map across surfaces: Business = info (blue),
        // Residence = success (green/teal). Subtle tint here on the list; the
        // Location-detail mark uses the same hues at saturated intensity.
        'inline-grid size-[22px] shrink-0 place-items-center rounded-[5px] border',
        business
          ? 'border-info-500/30 bg-info-500/10 text-info-500'
          : 'border-success-500/30 bg-success-500/10 text-success-500',
        className
      )}
    >
      <Icon className="size-[13px]" aria-hidden="true" />
    </span>
  );
}
