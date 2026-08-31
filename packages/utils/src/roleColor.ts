// Per-role accent color.
//
// Roles ship with one of two color sources:
//   1. A persisted `accentId` token on the role record (preferred). The id
//      maps to a tuned oklch value below. Survives renames.
//   2. A name-hash fallback for legacy roles that don't have `accentId` yet.
//      Same name → same color across the app, but a rename re-colors.
//
// Both paths share the same 10-swatch palette so the visual character
// stays consistent however the color got there. The palette is tuned so
// every entry reads at similar visual weight against bg-elev — orange and
// indigo should feel like siblings, not "one is shouting".

export type RoleAccentId =
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'red'
  | 'slate';

export interface AccentOption {
  // String, not `RoleAccentId`, because palettes are now plural — work order
  // types use the role palette, item statuses use a separate 7-swatch palette
  // (see STATUS_ACCENT_OPTIONS below). The picker only needs identity, not
  // a discriminated union.
  id: string;
  label: string;
  value: string;
}

// Public palette for color pickers. Order is the canonical swatch order on
// the role form's color picker — keep this list and the screen-roles-v15
// `ACCENT_OPTIONS` reference in sync.
export const ROLE_ACCENT_OPTIONS: AccentOption[] = [
  { id: 'orange', label: 'Orange', value: 'oklch(60% 0.16 45)' },
  { id: 'amber', label: 'Amber', value: 'oklch(60% 0.14 70)' },
  { id: 'green', label: 'Green', value: 'oklch(60% 0.14 145)' },
  { id: 'teal', label: 'Teal', value: 'oklch(58% 0.12 195)' },
  { id: 'blue', label: 'Blue', value: 'oklch(58% 0.14 215)' },
  { id: 'indigo', label: 'Indigo', value: 'oklch(58% 0.14 270)' },
  { id: 'violet', label: 'Violet', value: 'oklch(60% 0.14 285)' },
  { id: 'pink', label: 'Pink', value: 'oklch(60% 0.14 350)' },
  { id: 'red', label: 'Red', value: 'oklch(58% 0.18 25)' },
  { id: 'slate', label: 'Slate', value: 'oklch(50% 0.02 250)' },
];

// Item-status palette. Constrained to 7 swatches the backend documents as
// canonical for item statuses. Tuned to match `ROLE_ACCENT_OPTIONS` visual
// weight; `coral` and `gray` are unique to this palette.
export type StatusAccentId =
  | 'blue'
  | 'green'
  | 'amber'
  | 'violet'
  | 'teal'
  | 'coral'
  | 'gray';

export const STATUS_ACCENT_OPTIONS: AccentOption[] = [
  { id: 'blue', label: 'Blue', value: 'oklch(58% 0.14 215)' },
  { id: 'green', label: 'Green', value: 'oklch(60% 0.14 145)' },
  { id: 'amber', label: 'Amber', value: 'oklch(60% 0.14 70)' },
  { id: 'violet', label: 'Violet', value: 'oklch(60% 0.14 285)' },
  { id: 'teal', label: 'Teal', value: 'oklch(58% 0.12 195)' },
  { id: 'coral', label: 'Coral', value: 'oklch(64% 0.16 30)' },
  { id: 'gray', label: 'Gray', value: 'oklch(60% 0.02 250)' },
];

// Lookup spans both palettes so `roleAccent('coral')` and `roleAccent('blue')`
// both resolve. Where keys overlap (`blue`, `green`, `amber`, `violet`, `teal`)
// the role palette wins — the role values are the established visual weight.
const ACCENT_BY_ID: Record<string, string> = {
  ...Object.fromEntries(STATUS_ACCENT_OPTIONS.map((o) => [o.id, o.value])),
  ...Object.fromEntries(ROLE_ACCENT_OPTIONS.map((o) => [o.id, o.value])),
};

// Resolve a persisted accent id to an oklch value. Unknown ids fall back
// to the hash path so a typo or stale id doesn't render as a missing color.
export function roleAccent(accentId: string | undefined | null, fallbackName = ''): string {
  if (accentId && ACCENT_BY_ID[accentId]) return ACCENT_BY_ID[accentId];
  return roleColor(fallbackName);
}

// Hash-based fallback. Kept for legacy roles without `accentId` and for
// anywhere we only have a role name (audit log, chip without role record).
export function roleColor(roleName: string): string {
  let h = 0;
  for (let i = 0; i < roleName.length; i++) {
    h = (h * 31 + roleName.charCodeAt(i)) | 0;
  }
  const ord: RoleAccentId[] = [
    'red',
    'orange',
    'amber',
    'green',
    'teal',
    'blue',
    'indigo',
    'violet',
    'pink',
    'slate',
  ];
  return ACCENT_BY_ID[ord[Math.abs(h) % ord.length]];
}

// Convenience: resolve directly from a role-shaped object. Prefers the
// persisted id; falls back to the name hash. Use at every render site so
// the precedence rule lives in one place.
export function roleAccentFromRole(role: { accentId?: string | null; name: string }): string {
  return roleAccent(role.accentId, role.name);
}
