// ─────────────────────────────────────────────────────────────────
// ToggleGroup.tsx — segmented single-choice control.
//
// One row, N options, exactly one selected. Built on Headless's
// `<RadioGroup>` so arrow-key nav, focus management, and aria all
// come for free. Use for preference settings (Theme, Accent, density),
// view-mode toggles (Grid / List), or anything else that's a small
// fixed set of mutually-exclusive choices where a `<select>` would
// feel heavy.
//
// Visual: a recessed container (`--bg-elev-2`) with each option as a
// rounded inner pill. The selected option rises to `--bg-elev` with a
// soft 1px shadow — explicitly NOT a saturated accent fill, which is
// what we're walking back from `<Button color="accent-soft">` toggles
// that read like a primary CTA.
//
//   <ToggleGroup value={mode} onChange={setMode} aria-label="Theme">
//     <ToggleGroupOption value="light">☀ Light</ToggleGroupOption>
//     <ToggleGroupOption value="dark">☾ Dark</ToggleGroupOption>
//   </ToggleGroup>
//
// Generic over the value type T — pass any string-literal union.
// Icon-only options work too; supply `aria-label` on the option so
// screen readers still get a name.
// ─────────────────────────────────────────────────────────────────
import * as Headless from '@headlessui/react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

interface ToggleGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
  className?: string;
  // `sm` tightens padding + type for inline placements (e.g. beside a field
  // label); the default size is the standalone settings-row control.
  size?: 'sm';
  'aria-label'?: string;
}

export function ToggleGroup<T extends string>({
  value,
  onChange,
  children,
  className,
  size,
  'aria-label': ariaLabel,
}: ToggleGroupProps<T>) {
  return (
    <Headless.RadioGroup value={value} onChange={onChange} aria-label={ariaLabel}>
      <div className={clsx('toggle-group', size === 'sm' && 'toggle-group--sm', className)}>{children}</div>
    </Headless.RadioGroup>
  );
}

interface ToggleGroupOptionProps<T extends string> {
  value: T;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  title?: string;
}

export function ToggleGroupOption<T extends string>({
  value,
  children,
  className,
  'aria-label': ariaLabel,
  title,
}: ToggleGroupOptionProps<T>) {
  return (
    <Headless.Radio
      value={value}
      aria-label={ariaLabel}
      title={title}
      className={clsx('toggle-group-option', className)}
    >
      {children}
    </Headless.Radio>
  );
}
