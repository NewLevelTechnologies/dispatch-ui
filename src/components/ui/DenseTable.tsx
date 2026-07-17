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
// Labeled-stack mode — once <thead> is gone on mobile, a stacked value that
// lived under a column header can lose its meaning ("2", "Florida", "$50.00").
// Give it the header back as an inline label — but ONLY when it'd be ambiguous
// on its own. The test is AMBIGUITY, not "every cell":
//   • Label it when bare is unidentifiable: "Region: Florida", "Balance: $50.00"
//     (two identical $50.00 lines are meaningless without Amount/Balance).
//   • Leave it BARE when self-identifying by format: status pills, a formatted
//     phone, an email (the @ says email), a full address. The headline/identity
//     cell (name, and a location's address) is always bare.
//   • Multiple of the same kind ARE ambiguous → label each (Mobile / Office /
//     After hours for three phone numbers).
//   • Short values inline ("Make / Model: Simons · Rager"); only break to a
//     second line for genuinely long values (AI summaries, notes).
// Mechanics (all CSS-only — see styles/components.css):
//   • <td data-label="Balance">  → stacks as "Balance: $250".
//   • For a CellStack value, prefix its first line with
//     <span className="dt-inline-label">Contact: </span> instead (a ::before
//     can't sit inline on a flex-column stack).
//   • dt-inline-value → keep a SHORT value (and its parts) on the label's line
//     instead of stacking them beneath it; omit for long values that should wrap.
//   • dt-mobile-hide  → drop a column from the card (low value on a phone).
//   • dt-empty        → drop a cell whose value is just "—" (kept on desktop
//                       for column alignment, omitted from the card).
//   • <DenseTable className="dense-stack"> → the LAST cell is data, not a
//     kebab; stack it full-width instead of floating it to the corner.
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
