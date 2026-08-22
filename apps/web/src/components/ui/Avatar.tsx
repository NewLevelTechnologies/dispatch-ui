// ─────────────────────────────────────────────────────────────────
// Avatar.tsx — colored initials circle.
//
// The background hue is derived from the name so each person gets
// a stable color across the app without you assigning one. Two-letter
// initials from first + last name.
//
//   <Avatar name="Tanya Reyes" />
//   <Avatar name="Daniel Park" size="lg" />
//
// If you have profile pictures, pass `src` and they'll be used instead.
//
// Background color comes from `utils/roleColor()` — the same hash used by
// the sidebar user widget and the AccountSettings profile avatar — so the
// same person renders the same color everywhere in the app.
// ─────────────────────────────────────────────────────────────────
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { roleColor } from '../../utils/roleColor';

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

type Props = {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

export function Avatar({ name, src, size = 'md', className }: Props) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx('avatar object-cover', size !== 'md' && size, className)}
        style={{ borderColor: 'var(--border-strong)' }}
      />
    );
  }
  return (
    <div
      className={clsx('avatar', size !== 'md' && size, className)}
      style={{ '--av-bg': roleColor(name) } as CSSProperties}
      aria-label={name}
    >
      {initialsFromName(name)}
    </div>
  );
}
