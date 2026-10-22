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
  /**
   * The row the screen is currently about. Web mixes 5% violet into the card
   * surface (`color-mix(in oklch, var(--violet-500) 5%, var(--bg-elev))`) —
   * barely a tint, deliberately. A full `accentTint` here shouts.
   */
  rowCurrent: string;
  info: string;
  infoTint: string;
  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  danger: string;
  dangerTint: string;
};

// Generated from apps/web/src/styles/tokens.css via the CSS Color 4
// oklch->sRGB conversion. Keep in lockstep with web.
//
// The accent ramp comes from `.accent-cool`, NOT `:root`. tokens.css defaults
// to a warm orange, but web never ships it: ThemeProvider initialises accent
// to 'cool' and the pre-hydration script does too, so every running web client
// is steel teal. Phase 0 ported `:root` and gave this app an orange no web user
// has ever seen. There is no user-facing accent picker on either side — the
// toggle in ThemeProvider is reachable only from an unused AppShell — so this
// follows web's shipped default rather than adding a setting web lacks.
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
  accent500: '#0085a2',
  accent600: '#006c86',
  accent700: '#005469',
  accentTint: '#cfeef7',
  rowCurrent: '#f8f7fe',
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
  accent500: '#0085a2',
  accent600: '#006c86',
  // Dark remaps web's --fg-accent to accent-300 so accent text stays legible.
  accent700: '#67c0d5',
  accentTint: '#183238',
  rowCurrent: '#1c242e',
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
