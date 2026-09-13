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

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'violet';

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
  dot,
  variant,
  active,
  onToggle,
  ariaLabel,
}: {
  label: string;
  count?: number;
  tone?: Tone;
  /** A tone swatch before the label. Use it when the chip filters something
   *  the surface behind it already colours the same way — the dot is what
   *  ties "No-show" here to the no-show blocks out on the grid. */
  dot?: boolean;
  /**
   * `dense` for operational bands where a row of chips is chrome rather than
   * the page's main control: a full pill at 24px, the label quiet until you
   * reach for it, and the count as a bare mono figure instead of a badge —
   * a badge inside chrome competes with the counts out on the surface itself.
   */
  variant?: 'dense';
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
        'inline-flex items-center gap-1.5 border transition-colors',
        // !text-: Preflight's unlayered `button { font: inherit }` flows the
        // body's 13px onto the button, and a layered text-size utility cannot
        // beat it — the same trap Button carries a note about. Without the
        // important modifier every chip renders two pixels too large.
        variant === 'dense'
          ? 'h-6 rounded-full px-[9px] !text-[11.5px] font-semibold'
          : 'h-8 rounded-md px-2.5 !text-[12px] font-medium',
        active
          ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent hover:bg-[color-mix(in_oklch,var(--accent-500)_14%,var(--bg-elev))]'
          : variant === 'dense'
            ? 'border-border bg-bg-elev text-fg-muted hover:bg-bg-hover hover:text-fg-strong'
            : 'border-border bg-bg-elev text-fg hover:bg-bg-hover'
      )}
    >
      {dot && <span className={clsx('size-[7px] shrink-0 rounded-[2px]', dotToneClass(tone))} />}
      <span className={variant === 'dense' ? 'leading-none' : undefined}>{label}</span>
      {typeof count === 'number' && (
        <span
          className={clsx(
            // leading-none on both halves: a mono figure and a sans label have
            // different line boxes, and centring two unequal boxes is what
            // leaves the number sitting off the label's baseline.
            'font-mono leading-none tabular-nums',
            variant === 'dense'
              ? clsx('text-[10.5px]', active ? 'text-fg-accent' : 'text-fg-strong')
              : clsx(
                  'rounded px-1.5 py-px text-[10.5px] font-semibold',
                  active ? 'bg-accent-500/20 text-fg-accent' : countToneClass(tone),
                ),
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

/** The swatch is a flat fill in the tone, so it reads as the same colour the
 *  grid uses rather than a tinted wash of it. */
function dotToneClass(tone: Tone): string {
  switch (tone) {
    case 'info':
      return 'bg-info-500';
    case 'warning':
      return 'bg-warning-500';
    case 'success':
      return 'bg-success-500';
    case 'danger':
      return 'bg-danger-500';
    case 'violet':
      return 'bg-violet-500';
    case 'neutral':
    default:
      return 'bg-fg-muted';
  }
}

function countToneClass(tone: Tone): string {
  switch (tone) {
    case 'info':
      return 'bg-info-500/12 text-info-500';
    case 'violet':
      return 'bg-violet-500/12 text-violet-500';
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
