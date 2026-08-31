// ─────────────────────────────────────────────────────────────────
// FilterChipRow.tsx — flat inline filter chips with optional counts.
//
// Sister primitive to FilterChipListbox. Use this when the choices are
// a short, flat set (≤ 6 buttons) that read better as discrete toggles
// than as a labeled dropdown. Each chip is a button — clicking flips
// its active state. The row itself owns no state; the parent decides
// single-select vs multi-select semantics by what it does with onToggle.
//
//   <FilterChipRow>
//     <FilterChip
//       label="Commercial"
//       count={487}
//       active={typeFilter === 'COMMERCIAL'}
//       onToggle={() => setType(typeFilter === 'COMMERCIAL' ? null : 'COMMERCIAL')}
//     />
//     <FilterChip
//       label="Open jobs"
//       count={42}
//       tone="info"
//       active={openJobsOnly}
//       onToggle={() => setOpenJobsOnly((v) => !v)}
//     />
//   </FilterChipRow>
//
// `tone` is optional and only affects the count badge (subtle hint that
// "Open jobs" is an info concern, "Visit overdue" is warning, etc.).
// Active state uses the accent tint regardless of tone — one consistent
// "this filter is on" signal.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export function FilterChipRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

export function FilterChip({
  label,
  count,
  tone = 'neutral',
  active,
  onToggle,
  ariaLabel,
}: {
  label: string;
  count?: number;
  tone?: Tone;
  active: boolean;
  onToggle: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={ariaLabel ?? label}
      className={clsx(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors',
        active
          ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent hover:bg-[color-mix(in_oklch,var(--accent-500)_14%,var(--bg-elev))]'
          : 'border-border bg-bg-elev text-fg hover:bg-bg-hover'
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={clsx(
            'rounded px-1.5 py-px font-mono text-[10.5px] font-semibold tabular-nums',
            active
              ? 'bg-accent-500/20 text-fg-accent'
              : countToneClass(tone)
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function countToneClass(tone: Tone): string {
  switch (tone) {
    case 'info':
      return 'bg-info-500/12 text-info-500';
    case 'warning':
      return 'bg-warning-500/14 text-warning-500';
    case 'success':
      return 'bg-success-500/12 text-success-500';
    case 'danger':
      return 'bg-danger-500/12 text-danger-500';
    case 'neutral':
    default:
      return 'bg-bg-active text-fg-dim';
  }
}
