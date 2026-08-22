import clsx from 'clsx'
import type React from 'react'

// Label · value · action row. Designed to live inside `<Card padding="none">`
// so the row's px-3.5 produces edge-to-edge bottom dividers aligned with the
// card's title-header padding.
//
//   <Card title="Security" padding="none">
//     <DataRow label="Password" action={<Button outline size="xs">Change</Button>}>
//       <span className="text-[12.5px] text-fg-strong">Set Aug 14, 2022</span>
//     </DataRow>
//   </Card>
//
// `last` drops the bottom border for the final row in a stack.
// `labelWidth` overrides the default 140px label column on the desktop layout.
// Common widths in the codebase: 90 (Roles/Regions rows), 110 (UserDetail
// Security), 140 (default, AccountSettings).
//
// Responsive: at ≥640px renders as a three-column grid (label / value / action).
// Below 640px reflows vertically — label becomes a small uppercase eyebrow above
// the value, and the action drops to its own full-width row below.
export function DataRow({
  label,
  action,
  last,
  labelWidth = 140,
  className,
  children,
}: {
  label: React.ReactNode
  action?: React.ReactNode
  last?: boolean
  labelWidth?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={clsx(
        className,
        'flex flex-col gap-1.5 px-3.5 py-2.5',
        'sm:grid sm:items-center sm:gap-3.5 sm:[grid-template-columns:var(--data-row-lw)_1fr_auto]',
        !last && 'border-b border-border-soft'
      )}
      style={{ '--data-row-lw': `${labelWidth}px` } as React.CSSProperties}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted sm:text-[11.5px] sm:font-medium sm:normal-case sm:tracking-normal">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
      {action ? (
        <div className="[&>*]:w-full sm:[&>*]:w-auto">{action}</div>
      ) : (
        <div className="hidden sm:block" />
      )}
    </div>
  )
}
