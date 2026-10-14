import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import DocumentSettingsPanel from './DocumentSettingsPanel';
import { apiClient } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

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
    expect(screen.getByText(/A quote sent today expires/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', quoteValidityDays: 60 });
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
