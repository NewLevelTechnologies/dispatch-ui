// ─────────────────────────────────────────────────────────────────
// PageHead.tsx — title + subtitle + actions row at top of every page.
//
//   <PageHead
//     title="Jobs"
//     sub="38 open · 4 urgent · 14 scheduled today"
//     actions={<>
//       <Button variant="ghost">Export</Button>
//       <Button>New job</Button>
//     </>}
//   />
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { Heading } from '../catalyst/heading';
import { Text } from '../catalyst/text';

export function PageHead({
  title, sub, actions, eyebrow,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  // Optional row rendered above the title — e.g. an EntityToggle that swaps
  // between peer list routes (Customers ⇄ Payers).
  eyebrow?: ReactNode;
}) {
  // Mobile (<sm): the title block stacks above the actions row so long
  // action labels never get crushed mid-word against a cramped header.
  // The action container is `w-full` below sm — consumers can mark a
  // primary action with `flex-1` to claim that full width as a thumb
  // target while siblings (e.g. a kebab) stay at their natural width.
  return (
    <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <Heading level={1} size="page-lg" className="m-0">{title}</Heading>
        {sub && <Text size="sm" tone="muted" className="mt-0.5">{sub}</Text>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 max-sm:w-full sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
