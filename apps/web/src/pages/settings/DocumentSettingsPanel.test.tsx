import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import DocumentSettingsPanel from './DocumentSettingsPanel';
import { apiClient } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { GLOSSARY_DEFAULTS, useGlossary } from '../../contexts/GlossaryContext';

vi.mock('@dispatch/api/src/client');

describe('DocumentSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('MANAGE_PRICING'));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { agreementFeeTaxClass: 'FEE', quoteValidityDays: 30, updatedAt: null } });
  });

  it('changes how long quotes stay valid, keeping the agreement tax class', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { agreementFeeTaxClass: 'FEE', quoteValidityDays: 60, updatedAt: null } });
    renderWithProviders(<DocumentSettingsPanel />);

    const field = await screen.findByRole('textbox', { name: 'Valid for' });
    expect(field).toHaveValue('30');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '60' }));
    expect(field).toHaveValue('60');
    expect(screen.getByText(/Quotes sent today expire/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', quoteValidityDays: 60 });
  });

  it('sets the proposal margin floor as a percent, and removes it when cleared', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { agreementFeeTaxClass: 'FEE', quoteValidityDays: 30, marginFloor: 0.35, updatedAt: null } });
    renderWithProviders(<DocumentSettingsPanel />);

    const field = await screen.findByRole('textbox', { name: 'settings.documents.marginFloor.label' });
    expect(field).toHaveValue('');
    expect(screen.getByText('settings.documents.marginFloor.none')).toBeInTheDocument();
    await user.type(field, '35');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', marginFloor: 0.35 });

    const saved = await screen.findByRole('textbox', { name: 'settings.documents.marginFloor.label' });
    await user.clear(saved);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', marginFloor: 0 });
  });

  it('won’t take a margin floor of 100% or more', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentSettingsPanel />);

    await user.type(await screen.findByRole('textbox', { name: 'settings.documents.marginFloor.label' }), '100');
    expect(screen.getByText('settings.documents.marginFloor.invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('uses the company’s own names for quotes and customers', async () => {
    const original = vi.mocked(useGlossary).getMockImplementation()!;
    const renamed: Record<string, [string, string]> = { quote: ['Estimate', 'Estimates'], customer: ['Client', 'Clients'] };
    vi.mocked(useGlossary).mockReturnValue({
      getName: (code: string, plural = false) => renamed[code]?.[plural ? 1 : 0] ?? (plural ? GLOSSARY_DEFAULTS[code].plural : GLOSSARY_DEFAULTS[code].singular),
      getAbbrev: () => '',
      updateGlossary: vi.fn(),
    } as unknown as ReturnType<typeof useGlossary>);
    renderWithProviders(<DocumentSettingsPanel />);

    expect(await screen.findByText(/Estimates sent today expire/)).toBeInTheDocument();
    expect(screen.getByText('Estimates & invoices')).toBeInTheDocument();
    expect(screen.getByText(/Clients can’t approve after it expires/)).toBeInTheDocument();
    expect(screen.queryByText(/quote/i)).not.toBeInTheDocument();
    vi.mocked(useGlossary).mockImplementation(original);
  });

  it('won’t take a length outside 1 to 365 days', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentSettingsPanel />);

    const field = await screen.findByRole('textbox', { name: 'Valid for' });
    await user.clear(field);
    await user.type(field, '400');
    expect(screen.getByText('Enter 1 to 365 days.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('is view only without MANAGE_PRICING', async () => {
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    renderWithProviders(<DocumentSettingsPanel />);

    expect(await screen.findByRole('textbox', { name: 'Valid for' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: '60' })).not.toBeInTheDocument();
  });
});
