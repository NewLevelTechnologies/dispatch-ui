import type { ProgressCategory } from '../api';

// One visual grammar for a work-item's status category, shared by every surface
// that shows it: the overview peek, the Work Items tab (status pill + card
// left-rail), and the status picker. Keeping these in one place is what stops
// the tab's pill from drifting away from the rest of the WO page.
export type ProgressTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

// statusCategory → Pill tone.
export const PROGRESS_TONE: Record<ProgressCategory, ProgressTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'violet',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

// Pill tone → the 3px card left-rail color. Matched to the pill so the rail and
// the status pill on a card always read as the same state.
const TONE_RAIL: Record<ProgressTone, string> = {
  neutral: 'var(--fg-dim)',
  info: 'var(--info-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  danger: 'var(--danger-500)',
  accent: 'var(--accent-500)',
  violet: 'var(--violet-500)',
};

export const progressRailColor = (category: ProgressCategory): string =>
  TONE_RAIL[PROGRESS_TONE[category]];
