// ─────────────────────────────────────────────────────────────────
// Callout.tsx — highlighted info block. One container shape, six tints.
//
// Use for the "tinted box with optional icon + title + body + action"
// pattern that recurs across the app: page-level error states, region
// warnings on the user form, the 2FA-OFF CTA on Account Settings, the
// LifecycleFooter on a user detail page, manual-secret block in the
// 2FA setup wizard.
//
//   <Callout kind="warning">No regions selected — assign at least one.</Callout>
//
//   <Callout kind="danger">
//     Failed to load user: {message}
//   </Callout>
//
//   <Callout kind="accent" icon={<ShieldCheckIcon className="size-[18px]" />}
//            title="Protect your account with two-factor"
//            action={<Button size="xs">Enable</Button>}>
//     Codes refresh every 30 seconds in your authenticator app.
//   </Callout>
//
// Defaults:
//   · `kind` defaults to `info`.
//   · `icon` defaults to a heroicon matching `kind` (info → information
//     circle, warning → triangle, danger → exclamation, success → check).
//     Pass `icon={null}` to suppress; pass any ReactNode (incl. a filled
//     square containing an icon) to override.
//   · `accent` and `neutral` have no default icon — pass one if you want.
//
// Layout:
//   [icon] [content] [action]
//   where content = title (optional, on its own row) + body (children).
//   The outer row is `align-items: center`, so the action button stays
//   vertically centered with the full content block — not pinned to the
//   title row when the body wraps to multiple lines.
//
// Responsive: at ≥640px renders as a single row with the action at the
// trailing edge. Below 640px the action drops to its own full-width row
// below the body, and the icon top-aligns with the title row so it
// doesn't appear orphaned against the taller stacked content.
// ─────────────────────────────────────────────────────────────────
import type { ComponentType, ReactNode, SVGProps } from 'react';
import clsx from 'clsx';
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

export type CalloutKind = 'info' | 'warning' | 'danger' | 'success' | 'accent' | 'neutral';

const DEFAULT_ICONS: Partial<Record<CalloutKind, ComponentType<SVGProps<SVGSVGElement>>>> = {
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon,
  danger: ExclamationCircleIcon,
  success: CheckCircleIcon,
};

interface CalloutProps {
  kind?: CalloutKind;
  icon?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Callout({
  kind = 'info',
  icon,
  title,
  action,
  className,
  children,
}: CalloutProps) {
  let resolvedIcon: ReactNode;
  if (icon === undefined) {
    const DefaultIcon = DEFAULT_ICONS[kind];
    resolvedIcon = DefaultIcon ? <DefaultIcon className="size-[18px]" aria-hidden="true" /> : null;
  } else {
    resolvedIcon = icon;
  }

  return (
    <div className={clsx('callout', kind, className)}>
      {resolvedIcon && <div className="callout-icon">{resolvedIcon}</div>}
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        {children && <div className="callout-text">{children}</div>}
      </div>
      {action && <div className="callout-action">{action}</div>}
    </div>
  );
}
