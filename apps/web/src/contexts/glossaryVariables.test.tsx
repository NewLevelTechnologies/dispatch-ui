import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { i18n } from '@dispatch/i18n';

describe('glossary names in translations', () => {
  it('fills entity names into any string from the tenant’s glossary, and a passed param still wins', async () => {
    const { GlossaryProvider } = await vi.importActual<typeof import('./GlossaryContext')>('./GlossaryContext');
    render(
      <GlossaryProvider glossary={{ work_order: { singular: 'Job', plural: 'Jobs' }, technician: { singular: 'Installer', plural: 'Installers' } }}>
        <div />
      </GlossaryProvider>,
    );

    expect(i18n.t('customers.filter.openJobs')).toBe('Open jobs');
    expect(i18n.t('serviceLocations.filter.live')).toBe('Installer on site');
    // An explicit param of the same name (here the WO number) overrides the glossary name.
    expect(i18n.t('dispatchBoard.move.notifyFailed', { workOrder: 'WO-12', day: 'Tue' })).toMatch(/^WO-12 moved to Tue/);
  });
});
