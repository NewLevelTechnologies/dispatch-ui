// ─────────────────────────────────────────────────────────────────
// ListFooter.tsx — single bg-elev-2 band at the bottom of a list card.
//
// Left:  "Showing 1–25 of 142 customers" (or custom node)
// Right: Catalyst Pagination — middle/cmd-click opens a new tab when
//        hrefs are passed (the hrefs preserve current filter state).
//
// Usage with pagination:
//   <ListFooter
//     page={pageNumber}
//     totalPages={totalPages}
//     pageHref={pageHref}
//     left={<>Showing <strong>1–25</strong> of 142 customers · West only</>}
//   />
//
// Usage without pagination (client-side filtered list):
//   <ListFooter left={<>Showing 12 users</>} />
//
// `page` / `totalPages` / `pageHref` are all optional — omit them when
// there's nothing to paginate and the left band renders alone. Callers
// don't need to fabricate `page={1} totalPages={1}`.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../catalyst/pagination';

type Props = {
  page?: number;
  totalPages?: number;
  pageHref?: (page: number) => string;
  left?: ReactNode;
};

export function ListFooter({ page, totalPages, pageHref, left }: Props) {
  // Render the count-only band when there's nothing to paginate. Inlined
  // (rather than going through a boolean local) so TS narrows page /
  // totalPages / pageHref to non-undefined in the pagination branch.
  if (
    typeof page !== 'number' ||
    typeof totalPages !== 'number' ||
    typeof pageHref !== 'function' ||
    totalPages <= 1
  ) {
    if (!left) return null;
    return (
      <div className="flex items-center justify-between border-t border-border-soft bg-bg-elev-2 px-3 py-2 text-[11.5px] text-fg-muted">
        <span>{left}</span>
      </div>
    );
  }

  const pages: (number | 'gap')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('gap');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('gap');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between border-t border-border-soft bg-bg-elev-2 px-3 py-2 text-[11.5px] text-fg-muted">
      <span>{left}</span>
      <Pagination className="m-0">
        <PaginationPrevious href={page > 1 ? pageHref(page - 1) : null} />
        <PaginationList>
          {pages.map((p, idx) =>
            p === 'gap' ? (
              <PaginationGap key={`gap-${idx}`} />
            ) : (
              <PaginationPage key={p} href={pageHref(p)} current={p === page}>
                {String(p)}
              </PaginationPage>
            )
          )}
        </PaginationList>
        <PaginationNext href={page < totalPages ? pageHref(page + 1) : null} />
      </Pagination>
    </div>
  );
}
