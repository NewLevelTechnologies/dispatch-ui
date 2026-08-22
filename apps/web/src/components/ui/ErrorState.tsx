// ─────────────────────────────────────────────────────────────────
// ErrorState.tsx — in-list error placeholder for "couldn't fetch
// the data" failures where the rest of the page is fine.
//
//   <ErrorState
//     title="Couldn't load users"
//     description={extractApiError(error)}
//     action={<Button outline onClick={() => refetch()}>Try again</Button>}
//   />
//
// For page-level errors that block the whole screen, use
// <Callout kind="danger"> instead — that's the loud variant used on
// detail pages when the primary entity fails to load.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function ErrorState({ title, description, action }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <ExclamationTriangleIcon
        className="size-10 text-danger-500"
        aria-hidden="true"
      />
      <div className="mt-3 text-[14px] font-semibold text-fg-strong">{title}</div>
      {description && (
        <div className="mt-1 text-[12px] text-danger-500">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
