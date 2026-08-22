// ─────────────────────────────────────────────────────────────────
// StatusChip.tsx — small chip representing a workflow status.
//
// Shared primitive used wherever a status appears as a chip
// (transition rows, approval queue, callouts). Two sizes:
//   · `sm` — 11px text, 6px dot · in dense list rows
//   · `lg` — 13px text, 8px dot · in detail headers and callouts
//
// Accent is resolved through `roleAccent(accentId, name)` so a tenant's
// status palette flows through without each caller having to map.
// ─────────────────────────────────────────────────────────────────
import clsx from 'clsx';
import { roleAccent } from '../../utils/roleColor';

// Approval embeds can return null name/accentId when the upstream status
// row has been deleted or hasn't yet propagated through the cross-service
// cache. Render an "Unknown" label with the gray fallback dot instead of
// crashing — the data is referentially stale, not the user's problem.
type StatusLike = {
  id?: string;
  name: string | null | undefined;
  accentId: string | null | undefined;
};

type Size = 'sm' | 'lg';

export function StatusChip({
  status,
  size = 'sm',
  className,
}: {
  status: StatusLike;
  size?: Size;
  className?: string;
}) {
  const dotPx = size === 'lg' ? 8 : 6;
  const label = status.name ?? 'Unknown';
  // roleAccent falls back through the name hash when accentId is missing,
  // and to a deterministic palette entry when both are absent. Passing
  // empty strings keeps the function happy without TS narrowing pain.
  const dotColor = roleAccent(status.accentId ?? null, label);
  return (
    <span
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-md border border-border bg-bg-elev font-medium text-fg-strong',
        size === 'lg' ? 'gap-1.5 px-2.5 py-1 text-[13px]' : 'gap-1 px-1.5 py-0.5 text-[11px]',
        className,
      )}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{
          width: dotPx,
          height: dotPx,
          background: dotColor,
        }}
      />
      {label}
    </span>
  );
}
