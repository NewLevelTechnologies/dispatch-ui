// ─────────────────────────────────────────────────────────────────
// StatusIndicator.tsx — inline dot + label for record status.
//
// Three states, symmetric treatment so "Active" reads as a deliberate
// signal rather than the default. `closed` is terminal and visually
// distinct from `inactive`: hollow ring + strikethrough label so the
// row scans as "gone" rather than "paused."
//
//   <StatusIndicator status="active" />
//   <StatusIndicator status="inactive" />
//   <StatusIndicator status="closed" />
//
// Customers use only active/inactive. Locations use all three. The
// component accepts the lowercase strings so it interoperates directly
// with the URL status param without case-juggling at every call site.
// ─────────────────────────────────────────────────────────────────
import clsx from 'clsx';

type Status = 'active' | 'inactive' | 'closed';

const labels: Record<Status, string> = {
  active: 'Active',
  inactive: 'Inactive',
  closed: 'Closed',
};

export function StatusIndicator({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const display = label ?? labels[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-[11.5px] font-medium',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'size-2 shrink-0 rounded-full',
          status === 'active' &&
            'bg-success-500 shadow-[0_0_0_3px_color-mix(in_oklch,var(--success-500)_18%,transparent)]',
          status === 'inactive' &&
            'bg-fg-muted shadow-[0_0_0_3px_color-mix(in_oklch,var(--fg-muted)_14%,transparent)]',
          status === 'closed' && 'border border-fg-dim bg-transparent'
        )}
      />
      <span
        className={clsx(
          status === 'active' && 'text-fg-strong',
          status === 'inactive' && 'text-fg-muted',
          status === 'closed' && 'text-fg-dim line-through decoration-fg-dim/60'
        )}
      >
        {display}
      </span>
    </span>
  );
}
