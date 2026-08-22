// Small shared card-header atoms for the agreement detail surfaces. Kept in
// their own file (separate from agreementShared's utilities) so each module
// satisfies react-refresh's "only export components" rule.
import type React from 'react';
import { Link } from 'react-router-dom';

export function CardTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon && <span className="text-fg-muted">{icon}</span>}
      {children}
    </span>
  );
}

// Quiet ~11.5px accent affordance under a card title. Styled by the unlayered
// `.card-action` class (components.css) — a layered text-size utility can't beat
// Preflight's body font-size on a bare <button>, so the size lives in CSS. Pass
// `to` for a navigation link, otherwise `onClick` for an action button.
export function CardLink({
  children,
  onClick,
  to,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
  className?: string;
}) {
  const cls = className ? `card-action ${className}` : 'card-action';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
