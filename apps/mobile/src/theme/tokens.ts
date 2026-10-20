/**
 * Design tokens for the "Dashboard Continuity" direction — the one picked
 * after comparing it against a native-first alternative in a Claude Design
 * side-by-side (see memory/mobile-technician-app-plan.md). These are the
 * same oklch ramps as apps/web/src/styles/tokens.css, converted to hex
 * because React Native's StyleSheet has no oklch()/color-mix() support.
 *
 * Regenerate with the CSS Color 4 oklch->sRGB algorithm if a web token
 * value changes — don't hand-edit a hex to "look about right", it will
 * drift from web's palette silently.
 */

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * Sizes are larger than web's dense 10.5-13px desktop scale on purpose — a
 * technician reads this one-handed, often outdoors, not at a desk eight
 * hours a day. Same restrained density *ethos*, different physical scale.
 */
export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  subtitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMuted: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
  mono: { fontSize: 12, fontWeight: '600' as const },
} as const;

export type ThemeMode = 'light' | 'dark';

export type ColorTokens = {
  bg: string;
  bgSunken: string;
  bgElev: string;
  bgElev2: string;
  bgHover: string;
  bgActive: string;
  bar: string;
  barFg: string;
  barFgDim: string;
  fg: string;
  fgStrong: string;
  fgMuted: string;
  border: string;
  borderSoft: string;
  accent500: string;
  accent600: string;
  accent700: string;
  /** Soft tint for accent-toned surfaces (status pills, selection). */
  accentTint: string;
  info: string;
  infoTint: string;
  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  danger: string;
  dangerTint: string;
};

// Generated from apps/web/src/styles/tokens.css (`:root` + `.theme-light`)
// via the CSS Color 4 oklch->sRGB conversion. Keep in lockstep with web.
const light: ColorTokens = {
  bg: '#fbf9f7',
  bgSunken: '#f4f2ef',
  bgElev: '#ffffff',
  bgElev2: '#fdfcf9',
  bgHover: '#f2f0ec',
  bgActive: '#ebe7e2',
  bar: '#14161a',
  barFg: '#caced3',
  barFgDim: '#7c8186',
  fg: '#1e1a14',
  fgStrong: '#0e0b06',
  fgMuted: '#67635c',
  border: '#e4e1db',
  borderSoft: '#edebe7',
  accent500: '#ee6d00',
  accent600: '#d64d00',
  accent700: '#b43a00',
  accentTint: '#ffe8d1',
  info: '#0092d7',
  infoTint: '#dcf1fc',
  success: '#1a9951',
  successTint: '#ddf3e5',
  warning: '#935200',
  warningTint: '#fbedd1',
  danger: '#db2c2b',
  dangerTint: '#fbdddd',
};

// Generated from apps/web/src/styles/tokens.css (`.theme-dark`).
const dark: ColorTokens = {
  bg: '#14191e',
  bgSunken: '#0b1015',
  bgElev: '#1a2026',
  bgElev2: '#232a30',
  bgHover: '#282f36',
  bgActive: '#2f363e',
  bar: '#0b0d11',
  barFg: '#e1e5ea',
  barFgDim: '#a0a5ab',
  fg: '#e8ebef',
  fgStrong: '#fafcfe',
  fgMuted: '#b9bec4',
  border: '#394149',
  borderSoft: '#2a3138',
  accent500: '#ee6d00',
  accent600: '#d64d00',
  accent700: '#ffa460',
  accentTint: '#3a2a1c',
  info: '#0092d7',
  infoTint: '#1c3340',
  success: '#1a9951',
  successTint: '#1c3324',
  warning: '#e19c00',
  warningTint: '#3a2d14',
  danger: '#db2c2b',
  dangerTint: '#3a2020',
};

export const palettes: Record<ThemeMode, ColorTokens> = { light, dark };
