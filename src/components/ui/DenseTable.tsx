// ─────────────────────────────────────────────────────────────────
// DenseTable.tsx — thin wrappers over <table> with the tighter padding,
// sticky thead, monospace IDs, and two-line cell pattern this design
// uses everywhere.
//
//   <DenseTable>
//     <DenseTHead>
//       <tr><th>Job</th><th>Customer</th><th className="right">Value</th></tr>
//     </DenseTHead>
//     <tbody>
//       <DenseRow urgent={j.urgent}>
//         <td>
//           <CellStack>
//             <CellTop>{j.id}</CellTop>
//             <CellSub>{j.type}</CellSub>
//           </CellStack>
//         </td>
//         ...
//       </DenseRow>
//     </tbody>
//   </DenseTable>
//
// Mobile-card layout (< 640px) assumes the FIRST cell is the row's title
// and the LAST cell is the kebab. If you need leading-edge chrome —
// drag handle, checkbox, expand caret — put it INSIDE the first content
// cell as a flex sibling, not in its own column. A separate first-column
// cell will hijack the title slot on mobile.
//
// Labeled-stack mode — for detail tables with NO kebab column, where a
// bare value reads as ambiguous once the <thead> is gone on mobile:
//   • <td data-label="Balance">  → stacks as "Balance: $250" on mobile.
//   • For a CellStack value, prefix its first line with
//     <span className="dt-inline-label">Contact: </span> instead (a ::before
//     can't sit inline on a flex-column stack).
//   • dt-mobile-hide  → drop a column from the card (low value on a phone).
//   • dt-empty        → drop a cell whose value is just "—" (kept on desktop
//                       for column alignment, omitted from the card).
//   • <DenseTable className="dense-stack"> → the LAST cell is data, not a
//     kebab; stack it full-width instead of floating it to the corner.
// (All of the above are CSS-only — see styles/components.css.)
// ─────────────────────────────────────────────────────────────────
import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';

export function DenseTable({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return <table className={clsx('dense-table', className)} {...p} />;
}

export function DenseTHead(p: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...p} />;
}

export function DenseRow({
  urgent, className, onClick, onKeyDown, ...p
}: HTMLAttributes<HTMLTableRowElement> & { urgent?: boolean }) {
  const isClickable = typeof onClick === 'function';

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    // Caller's own keydown handler wins.
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      // Only activate when the row itself is focused — child interactives
      // (kebab buttons, links) own their own key handling.
      if (e.currentTarget !== e.target) return;
      e.preventDefault();
      onClick(e as unknown as MouseEvent<HTMLTableRowElement>);
    }
  };

  return (
    <tr
      className={clsx(urgent && 'urgent', isClickable && 'dense-row-interactive', className)}
      onClick={onClick}
      onKeyDown={isClickable ? handleKeyDown : onKeyDown}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
      {...p}
    />
  );
}

export function CellStack({ children }: { children: ReactNode }) {
  return <div className="cell-stack">{children}</div>;
}
export function CellTop({ children }: { children: ReactNode }) {
  return <span className="top">{children}</span>;
}
export function CellSub({ children }: { children: ReactNode }) {
  return <span className="bot">{children}</span>;
}
