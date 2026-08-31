import { describe, it, expect } from 'vitest';
import { tagPillTone, tagSwatchColor, nextTagColor, TAG_COLOR_OPTIONS } from './tagColor';

describe('tagPillTone', () => {
  it('maps the five semantic enum values to their pill tones', () => {
    expect(tagPillTone('NEUTRAL')).toBe('neutral');
    expect(tagPillTone('INFO')).toBe('info');
    expect(tagPillTone('SUCCESS')).toBe('success');
    expect(tagPillTone('WARNING')).toBe('warning');
    expect(tagPillTone('DANGER')).toBe('danger');
  });

  it('maps the three accent values to tenant-neutral hues', () => {
    expect(tagPillTone('ACCENT_1')).toBe('violet');
    expect(tagPillTone('ACCENT_2')).toBe('teal');
    expect(tagPillTone('ACCENT_3')).toBe('pink');
  });

  it('falls back to neutral for legacy hex / unknown / empty values', () => {
    expect(tagPillTone('#3b82f6')).toBe('neutral');
    expect(tagPillTone('mauve')).toBe('neutral');
    expect(tagPillTone(null)).toBe('neutral');
    expect(tagPillTone(undefined)).toBe('neutral');
  });
});

describe('tagSwatchColor', () => {
  it('resolves to the design-token var matching the pill hue', () => {
    expect(tagSwatchColor('ACCENT_2')).toBe('var(--teal-500)');
    expect(tagSwatchColor('INFO')).toBe('var(--info-500)');
    expect(tagSwatchColor('ACCENT_1')).toBe('var(--violet-500)');
  });

  it('falls back to the muted foreground var for off-enum values', () => {
    expect(tagSwatchColor('#abc')).toBe('var(--fg-muted)');
    expect(tagSwatchColor(null)).toBe('var(--fg-muted)');
  });
});

describe('nextTagColor', () => {
  it('cycles through the create palette by count, skipping NEUTRAL', () => {
    expect(nextTagColor(0)).toBe('INFO');
    expect(nextTagColor(1)).toBe('SUCCESS');
    // 7 hues in the create palette → wraps back around.
    expect(nextTagColor(7)).toBe(nextTagColor(0));
    expect(nextTagColor(8)).toBe(nextTagColor(1));
  });

  it('never returns NEUTRAL', () => {
    for (let i = 0; i < 20; i++) expect(nextTagColor(i)).not.toBe('NEUTRAL');
  });

  it('handles negative counts without throwing', () => {
    expect(() => nextTagColor(-3)).not.toThrow();
    expect(nextTagColor(-7)).toBe(nextTagColor(0));
  });
});

describe('TAG_COLOR_OPTIONS', () => {
  it('exposes all eight enum values', () => {
    expect(TAG_COLOR_OPTIONS).toHaveLength(8);
    expect(TAG_COLOR_OPTIONS.map((o) => o.id)).toContain('ACCENT_3');
  });
});
