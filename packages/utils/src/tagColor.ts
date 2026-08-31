// Tag color → pill tone.
//
// The backend stores tag color as a fixed 8-value enum (a palette key, not a
// raw hex), and the UI renders tags with the shared `.pill` tone system (the
// same low-opacity color-mix fill the status badges use). This module is the
// single place that maps the enum to a `.pill` tone class.
//
// Five values map straight to the semantic tones. The three ACCENT_* values
// are tenant-neutral hues — deliberately NOT the tenant `--accent` ramp, so a
// tenant's tags never inherit their brand tint and all look alike. ACCENT_1
// reuses the existing `violet` tone (purple); ACCENT_2/3 add `teal`/`pink`.

export type TagColor =
  | 'NEUTRAL'
  | 'INFO'
  | 'SUCCESS'
  | 'WARNING'
  | 'DANGER'
  | 'ACCENT_1'
  | 'ACCENT_2'
  | 'ACCENT_3';

// `.pill` tone class names (see styles/components.css).
type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'teal' | 'pink';

const TONE_BY_COLOR: Record<TagColor, PillTone> = {
  NEUTRAL: 'neutral',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
  ACCENT_1: 'violet',
  ACCENT_2: 'teal',
  ACCENT_3: 'pink',
};

// Map a stored color to its `.pill` tone class. Tolerant of unknown / legacy
// values (an early FE build assumed hex): anything off-enum falls back to
// `neutral` rather than rendering an invalid class.
export function tagPillTone(color: string | null | undefined): PillTone {
  if (color && color in TONE_BY_COLOR) return TONE_BY_COLOR[color as TagColor];
  return 'neutral';
}

// CSS color (a design-token var) for a small tag swatch/dot — used where a
// full tinted pill would be too heavy, e.g. the filter-dropdown option rows.
// Resolves to the same hue each `.pill` tone draws from, so a dot and a pill
// for the same tag match.
const SWATCH_VAR_BY_TONE: Record<PillTone, string> = {
  neutral: 'var(--fg-muted)',
  info: 'var(--info-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  danger: 'var(--danger-500)',
  violet: 'var(--violet-500)',
  teal: 'var(--teal-500)',
  pink: 'var(--pink-500)',
};

export function tagSwatchColor(color: string | null | undefined): string {
  return SWATCH_VAR_BY_TONE[tagPillTone(color)];
}

export interface TagColorOption {
  id: TagColor;
  label: string;
  tone: PillTone;
}

// Canonical palette order — used by color pickers and the inline-create
// "next color" rule. NEUTRAL leads the list (it's the no-color choice) but is
// skipped when auto-assigning a color to a freshly created tag.
export const TAG_COLOR_OPTIONS: TagColorOption[] = [
  { id: 'NEUTRAL', label: 'Neutral', tone: 'neutral' },
  { id: 'INFO', label: 'Blue', tone: 'info' },
  { id: 'SUCCESS', label: 'Green', tone: 'success' },
  { id: 'WARNING', label: 'Amber', tone: 'warning' },
  { id: 'DANGER', label: 'Red', tone: 'danger' },
  { id: 'ACCENT_1', label: 'Purple', tone: 'violet' },
  { id: 'ACCENT_2', label: 'Teal', tone: 'teal' },
  { id: 'ACCENT_3', label: 'Pink', tone: 'pink' },
];

// Hues a new tag cycles through (NEUTRAL excluded — a created tag should get a
// real color the user can recolor later in tag management).
const CREATE_PALETTE: TagColor[] = ['INFO', 'SUCCESS', 'WARNING', 'DANGER', 'ACCENT_1', 'ACCENT_2', 'ACCENT_3'];

// Pick the color for an inline-created tag by cycling the palette off the
// current tenant tag count, so successive new tags spread across hues instead
// of all landing on the same one.
export function nextTagColor(existingTagCount: number): TagColor {
  const i = ((existingTagCount % CREATE_PALETTE.length) + CREATE_PALETTE.length) % CREATE_PALETTE.length;
  return CREATE_PALETTE[i];
}
