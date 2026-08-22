// ─────────────────────────────────────────────────────────────────
// EntityToggle.tsx — small segmented control that navigates between two
// (or more) peer list routes, e.g. Customers ⇄ Payers. Sits above the
// page title (PageHead `eyebrow` slot).
//
// Each segment is a real route link (NavLink), so the active segment is
// driven by the URL — deep-linking, refresh, and the back button all work,
// and each route keeps its own search/sort/filter state. Use this for
// "two views of the same records" relationships where a sidebar peer would
// overstate it; it replaces asymmetric cross-page links.
//
//   <EntityToggle
//     ariaLabel="Switch between customers and payers"
//     items={[
//       { label: 'Customers', to: '/customers' },
//       { label: 'Payers',    to: '/payers' },
//     ]}
//   />
// ─────────────────────────────────────────────────────────────────
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

export interface EntityToggleItem {
  label: string;
  to: string;
}

export function EntityToggle({
  items,
  ariaLabel,
  className,
}: {
  items: EntityToggleItem[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg-elev p-0.5',
        className
      )}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            clsx(
              'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-accent-500/12 text-fg-accent'
                : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default EntityToggle;
