// Shared chrome for the redesigned Customer detail variants (MULTI now; SINGLE
// + BILLING_ONLY to follow). Kept deliberately small — the heavy composition
// lives in each variant's tab files. OrgMark + CardLink + CardTitle match the
// conventions established on ServiceLocationDetailPage so the two detail pages
// read as one design.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { orgInitials } from './format';

// Square accent mark with initials — the customer entity glyph. Square (vs the
// circular person Avatar, vs the Location pin, vs the Payer gold "$") so a
// Customer reads as a distinct entity at a glance in the header / search.
export function OrgMark({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="grid size-[52px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-accent-500 to-accent-700 text-[17px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.12)]"
    >
      {orgInitials(name)}
    </div>
  );
}

// The Payer entity glyph — a muted-gold square with a "$". Distinct from the
// Customer accent square (OrgMark) and the Location pin so a BILLING_ONLY payer
// reads as a financial counterparty at a glance. `size` lets the list row use a
// compact mark (≈26px) and the detail header the large one (52px, default).
export function PayerMark({ size = 52 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center bg-gradient-to-br from-amber-500 to-amber-700 font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.12)]"
      style={{ width: size, height: size, borderRadius: size >= 40 ? 10 : 6, fontSize: Math.round(size * 0.42) }}
    >
      $
    </div>
  );
}

// Card title with an optional leading icon. Pairs with the catalyst `Card`'s
// `title` slot.
export function CardTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon && <span className="text-fg-muted">{icon}</span>}
      {children}
    </span>
  );
}

// Quiet ~11.5px accent affordance under a card title. Sized by the unlayered
// `.card-action` class (components.css) because a layered Tailwind text-size
// utility can't beat the global font-size on a bare <button>. Pass `to` for a
// route link, else `onClick` for an action button.
export function CardLink({
  children,
  onClick,
  to,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  className?: string;
  // When several cards each expose a short "Edit" link, give them distinct
  // accessible names so screen readers (and tests) can tell them apart.
  ariaLabel?: string;
}) {
  const cls = className ? `card-action ${className}` : 'card-action';
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
