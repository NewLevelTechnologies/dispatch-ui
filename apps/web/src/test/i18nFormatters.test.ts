import { describe, it, expect, vi } from 'vitest';

// setup.ts mocks react-i18next with its own interpolation (which lowercases
// by itself); this checks the real i18next config instead.
vi.unmock('react-i18next');

describe('i18n config', () => {
  it('lowercases a glossary name passed with the lowercase format', async () => {
    const { i18n } = await import('@dispatch/i18n');
    expect(i18n.t('common.actions.loading', { entities: 'Work Orders' })).toBe('Loading work orders...');
    expect(i18n.t('common.actions.loading', { entities: 'Jobs' })).toBe('Loading jobs...');
  });
});
