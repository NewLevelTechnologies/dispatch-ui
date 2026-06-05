// ─────────────────────────────────────────────────────────────────────────────
// DateRangeFields — the From/To day inputs revealed when a date filter chip is
// in "custom" mode. One shared row so every list toolbar (global Work Orders /
// Invoices, location Jobs / Invoices / Dispatches tabs) offers arbitrary
// ranges, not just presets.
//
// Values are inclusive yyyy-mm-dd day strings; either side may be empty for an
// open-ended range. The HOST converts to its endpoint's wire format — day
// strings pass through as-is (work orders, invoices), timestamp columns go
// through instantRangeForDays (location dispatches, half-open).
// ─────────────────────────────────────────────────────────────────────────────
import { useTranslation } from 'react-i18next';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { dense } from './dense';

export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={className ? `flex flex-wrap items-end gap-2 ${className}` : 'flex flex-wrap items-end gap-2'}>
      <Field className="w-44">
        <Label className="text-xs text-fg-muted">{t('workOrders.dates.from')}</Label>
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className={dense.input} />
      </Field>
      <Field className="w-44">
        <Label className="text-xs text-fg-muted">{t('workOrders.dates.to')}</Label>
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className={dense.input} />
      </Field>
    </div>
  );
}
