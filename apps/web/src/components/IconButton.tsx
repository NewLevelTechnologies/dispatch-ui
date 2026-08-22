import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Tight icon-only inline button. Use for things like row reorder arrows,
 * row-level remove buttons, table-row controls — any place where the
 * Catalyst Button's accessibility-floor padding is too generous.
 *
 * Catalyst's `Button` enforces a min-height for mobile touch-target a11y
 * (~44px floor), which is the right default for primary actions but wrong
 * for icon-only inline controls inside a dense table row. This component
 * is the codebase-wide escape hatch for those cases.
 *
 * Accessibility:
 *   - Always supply `aria-label` (required) — the icon child is not text.
 *   - `title` is rendered as a tooltip on hover/focus; pass it for
 *     mouse-user discoverability.
 *
 * Styling:
 *   - Defaults: `p-0.5` padding, neutral foreground, hover bg, disabled
 *     opacity. Dark-mode aware.
 *   - Pass `className` to extend (e.g. accent colors, larger padding).
 */
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  'aria-label': string;
  children: ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', type = 'button', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={[
        'rounded p-0.5 text-zinc-500 transition-colors',
        'hover:bg-zinc-100 hover:text-zinc-700',
        'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500',
        'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500',
        'dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
        'dark:disabled:hover:text-zinc-400',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
});

export default IconButton;
