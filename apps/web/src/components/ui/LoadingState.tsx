// ─────────────────────────────────────────────────────────────────
// LoadingState.tsx — quiet, delayed spinner for data-fetch states.
//
// Drop inside <CardBody flush> while a query is pending. The 250 ms
// default delay means fast queries never flash a spinner; slow ones
// reveal it once the wait is long enough to feel like waiting.
//
//   <LoadingState />                       ← "Loading…"
//   <LoadingState label="Loading users…" />
//   <LoadingState delay={0} />             ← no delay, show immediately
// ─────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

type Props = {
  label?: string;
  /** ms before the spinner appears. Default 250 — avoids flash on fast queries. */
  delay?: number;
};

export function LoadingState({ label = 'Loading…', delay = 250 }: Props) {
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-12 text-[12px] text-fg-muted"
    >
      <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
