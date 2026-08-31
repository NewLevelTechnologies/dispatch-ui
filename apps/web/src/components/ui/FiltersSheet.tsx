// ─────────────────────────────────────────────────────────────────
// FiltersSheet — bottom-anchored sheet that hosts list filters on mobile.
//
// On list pages the filter chips wrap to multiple rows below `sm`, which is
// heavy and won't scale as more filters land. The pattern is: keep the chips
// inline on desktop, and below `sm` collapse them into a single "Filters"
// button that opens this sheet. Drop the same filter controls in as children.
//
//   <FiltersSheet
//     open={open}
//     onClose={() => setOpen(false)}
//     title="Filters"
//     onClearAll={clearFilters}
//     clearAllLabel="Clear all"
//     clearAllDisabled={activeCount === 0}
//     doneLabel="Done"
//   >
//     <FilterChipListbox … />
//     <FilterChipListbox … />
//   </FiltersSheet>
//
// Filters apply live (the chips push to URL state on change), so there's no
// staged "Apply" step — "Done" simply dismisses, and tapping the scrim or Esc
// does the same. Built on Headless UI's Dialog: focus trap + body scroll lock
// come for free.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import * as Headless from '@headlessui/react';
import { Button } from '../catalyst/button';

export function FiltersSheet({
  open,
  onClose,
  title,
  children,
  onClearAll,
  clearAllLabel,
  clearAllDisabled,
  doneLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onClearAll?: () => void;
  clearAllLabel: string;
  clearAllDisabled?: boolean;
  doneLabel: string;
}) {
  return (
    <Headless.Dialog open={open} onClose={onClose}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 z-40 bg-zinc-950/40 transition duration-150 data-closed:opacity-0 dark:bg-zinc-950/60"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center">
        <Headless.DialogPanel
          transition
          className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-border bg-bg-elev shadow-lg transition duration-200 ease-out data-closed:translate-y-full"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="border-b border-border-soft px-4 py-3">
            <Headless.DialogTitle className="text-[14px] font-semibold text-fg-strong">
              {title}
            </Headless.DialogTitle>
          </div>
          <div className="flex flex-col items-start gap-3 overflow-y-auto px-4 py-4">
            {children}
          </div>
          <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
            <Button plain size="xs" onClick={onClearAll} disabled={clearAllDisabled}>
              {clearAllLabel}
            </Button>
            <span className="flex-1" />
            <Button color="accent" size="xs" onClick={onClose}>
              {doneLabel}
            </Button>
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  );
}
