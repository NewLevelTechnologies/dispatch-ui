// ─────────────────────────────────────────────────────────────────
// EmptyState.tsx — "no records" placeholder for list pages and
// section-level empties on detail pages.
//
// Default variant: centered column, py-12, icon ~40 px, title +
// description + optional action. Use inside <CardBody flush> on
// list pages.
//
//   <EmptyState
//     icon={<UsersIcon className="size-10 text-fg-dim" />}
//     title="No users yet"
//     description="Invite your team to get started."
//     action={<Button color="accent" onClick={handleAdd}>Add user</Button>}
//   />
//
// Compact variant: smaller, no icon — for section emptiness inside
// detail-page cards ("No regions assigned").
//
//   <EmptyState compact title="No regions assigned" />
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';

type Props = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Smaller, icon-less variant for in-card section emptiness. */
  compact?: boolean;
};

export function EmptyState({ icon, title, description, action, compact }: Props) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="text-[12.5px] font-semibold text-fg-strong">{title}</div>
        {description && (
          <div className="mt-0.5 text-[11px] text-fg-muted">{description}</div>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3">{icon}</div>}
      <div className="text-[14px] font-semibold text-fg-strong">{title}</div>
      {description && (
        <div className="mt-1 text-[12px] text-fg-muted">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
