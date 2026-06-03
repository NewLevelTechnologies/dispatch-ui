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
import { Pill } from './Pill';

type Premise = 'BUSINESS' | 'RESIDENCE';

export function PremiseMark({
  premise,
  title,
  className,
}: {
  premise: Premise;
  title?: string;
  className?: string;
}) {
  const business = premise === 'BUSINESS';
  const Icon = business ? BuildingOffice2Icon : HomeIcon;
  return (
    <span
      title={title ?? (business ? 'Business' : 'Residence')}
      aria-label={title ?? (business ? 'Business' : 'Residence')}
      className={clsx(
        'inline-grid size-[22px] shrink-0 place-items-center rounded-[5px] border',
        business
          ? 'border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-300'
          : 'border-border-soft bg-bg-active text-fg-muted',
        className
      )}
    >
      <Icon className="size-[13px]" aria-hidden="true" />
    </span>
  );
}

// Premise as a label pill — same vocabulary + glyph as PremiseMark, rendered in
// the Pill primitive so it sits in a status-pill row at the shared pill sizing/
// radius. Business reads accent (the commercial/billable default); Residence is
// neutral with muted text. Read-only — premise is edited via the header inline
// editor's Residence/Business toggle.
export function PremisePill({ premise, className }: { premise: Premise; className?: string }) {
  const business = premise === 'BUSINESS';
  const Icon = business ? BuildingOffice2Icon : HomeIcon;
  return (
    <Pill tone={business ? 'accent' : 'neutral'} className={clsx(!business && 'text-fg-muted', className)}>
      <Icon className="size-3" aria-hidden="true" />
      {business ? 'Business' : 'Residence'}
    </Pill>
  );
}
