import type { CSSProperties } from 'react';
import { roleAccent } from '../utils/roleColor';

// Small dot + role name chip used in the user-detail header and Roles +
// Regions card. One component, one source of truth for size and color, so
// the two render sites stay visually identical.
//
// `accentId` is the persisted color token on the role record. When set, it
// wins over the name-hash fallback so renaming a role doesn't reshuffle
// its color. Callers that only have a name (legacy audit-log rows, etc.)
// can omit it; the chip falls back to the hash.
//
// Theme-aware contrast lifting lives in CSS (`.role-chip` rule in
// styles/components.css) — passing the accent as a `--chip-accent` custom
// property lets the dark-mode override blend low-chroma colors (e.g.
// `slate`) toward near-white so they stay legible against bg-elev.
export function RoleChip({ name, accentId }: { name: string; accentId?: string | null }) {
  const color = roleAccent(accentId, name);
  return (
    <span
      className="role-chip"
      style={{ '--chip-accent': color } as CSSProperties}
    >
      <span className="role-chip-dot" />
      {name}
    </span>
  );
}

export default RoleChip;
