// ─────────────────────────────────────────────────────────────────
// Pill.tsx — status badges with optional dot.
//
// Pick a `tone` for color. Add `dot` for the status circle. Add `live`
// to the dot to signal "live state, not just label" — renders a soft
// glow ring around the dot in the tone color. Add `inline` when the
// pill needs to live inside a metadata line and a full colored bg
// would over-weight — strips the background/padding so it's just the
// dot + label.
//
//   <Pill tone="info" dot>Scheduled</Pill>
//   <Pill tone="success" dot live>Active</Pill>
//   <Pill tone="neutral" dot>Disabled</Pill>
//   <Pill tone="success" dot live inline>Active</Pill>   ← inside a meta line
//   <Pill tone="success">Paid</Pill>
//
// Tag is the same idea but rectangular, monospace — for codes like
// "PRT-CAP-3550", "T-04", "WO-3892". Pass `word` for a proportional label
// ("Field purchase", "Retail") that isn't a code.
// ─────────────────────────────────────────────────────────────────
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

export function Pill({
  tone = 'neutral',
  dot,
  live,
  inline,
  className,
  children,
  ...p
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  live?: boolean;
  inline?: boolean;
}) {
  return (
    <span
      className={clsx('pill', tone, live && 'live', inline && 'inline', className)}
      {...p}
    >
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Tag({ word, className, ...p }: HTMLAttributes<HTMLSpanElement> & { word?: boolean }) {
  return <span className={clsx('tag', word && 'tag--word', className)} {...p} />;
}
