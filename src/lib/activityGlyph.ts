// ─────────────────────────────────────────────────────────────────
// activityGlyph.ts — maps an activity event to its glanceable marker: a
// glyph character + a tone, and the tone → {bg, fg} swatch used to paint
// the little rounded glyph box. Shared by the Location Activity tab and the
// Overview "Recent activity" teaser so both render identical iconography.
// ─────────────────────────────────────────────────────────────────
import type { ActivityCategory, ActivityEvent, ActivityKind } from '../api';

export type ActivityTone = 'info' | 'success' | 'warning' | 'accent' | 'neutral';

// Per-kind glyph + tone, matching the design mock's iconography. Falls back by
// category for kinds the UI doesn't map explicitly.
// Tone principle (per design review): business events get COLORED glyphs so
// they pop pre-attentively — money $ reads green, dispatch arrows read blue,
// notes read amber, work-order milestones read accent/green. Audit/change and
// teardown events (updated/cancelled/archived/deleted) stay muted gray so the
// colored business moments are what the eye sorts on.
const KIND_GLYPH: Partial<Record<ActivityKind, { glyph: string; tone: ActivityTone }>> = {
  WORK_ORDER_CREATED: { glyph: '+', tone: 'accent' },
  WORK_ORDER_COMPLETED: { glyph: '✓', tone: 'success' },
  WORK_ORDER_UPDATED: { glyph: '✎', tone: 'neutral' },
  WORK_ORDER_CANCELLED: { glyph: '✕', tone: 'neutral' },
  WORK_ORDER_ARCHIVED: { glyph: '⌫', tone: 'neutral' },
  WORK_ORDER_UNARCHIVED: { glyph: '↺', tone: 'neutral' },
  WORK_ITEM_CREATED: { glyph: '+', tone: 'neutral' },
  WORK_ITEM_UPDATED: { glyph: '✎', tone: 'neutral' },
  WORK_ITEM_STATUS_CHANGED: { glyph: '✓', tone: 'success' },
  WORK_ITEM_DELETED: { glyph: '✕', tone: 'neutral' },
  DISPATCH_ASSIGNED: { glyph: '→', tone: 'info' },
  DISPATCH_DEPARTED: { glyph: '→', tone: 'info' },
  DISPATCH_ARRIVED: { glyph: '→', tone: 'info' },
  DISPATCH_CHECKED_OUT: { glyph: '✓', tone: 'success' },
  DISPATCH_CANCELLED: { glyph: '✕', tone: 'neutral' },
  DISPATCH_NO_SHOW: { glyph: '⚠', tone: 'warning' },
  NOTE_ADDED: { glyph: '✎', tone: 'warning' },
  NOTE_DELETED: { glyph: '✕', tone: 'neutral' },
  QUOTE_SENT: { glyph: '⎙', tone: 'accent' },
  QUOTE_ACCEPTED: { glyph: '✓', tone: 'success' },
  QUOTE_DECLINED: { glyph: '✕', tone: 'neutral' },
  INVOICE_ISSUED: { glyph: '$', tone: 'success' },
  INVOICE_PAID: { glyph: '$', tone: 'success' },
  PAYMENT_RECEIVED: { glyph: '$', tone: 'success' },
  PO_CREATED: { glyph: '+', tone: 'neutral' },
};

const CATEGORY_GLYPH: Record<ActivityCategory, { glyph: string; tone: ActivityTone }> = {
  STATUS: { glyph: '✓', tone: 'neutral' },
  DISPATCH: { glyph: '→', tone: 'info' },
  NOTE: { glyph: '✎', tone: 'warning' },
  FINANCIAL: { glyph: '$', tone: 'success' },
};

export function glyphFor(event: ActivityEvent): { glyph: string; tone: ActivityTone } {
  return KIND_GLYPH[event.kind] ?? CATEGORY_GLYPH[event.category] ?? { glyph: '•', tone: 'neutral' };
}

export const ACTIVITY_TONE_STYLE: Record<ActivityTone, { bg: string; fg: string }> = {
  info: {
    bg: 'color-mix(in oklch, var(--info-500) 14%, transparent)',
    fg: 'var(--info-500)',
  },
  success: {
    bg: 'color-mix(in oklch, var(--success-500) 14%, transparent)',
    fg: 'var(--success-500)',
  },
  warning: {
    bg: 'color-mix(in oklch, var(--warning-500) 14%, transparent)',
    fg: 'var(--warning-fg)',
  },
  accent: {
    bg: 'color-mix(in oklch, var(--accent-500) 14%, transparent)',
    fg: 'var(--accent-700)',
  },
  neutral: { bg: 'var(--bg-active)', fg: 'var(--fg-muted)' },
};
