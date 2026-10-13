import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { LocationTaxJurisdiction } from './LocationTaxJurisdiction';
import { apiClient } from '../api/setup';
import { useHasAnyCapability } from '../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const phoenix = {
  id: 'j-1', name: 'Phoenix, AZ', rate: 0.086, taxesLabor: false, taxesMaterials: true, taxesEquipment: true, taxesFees: false,
  isDefault: true, active: true, createdAt: null, updatedAt: null,
};
const tempe = { ...phoenix, id: 'j-2', name: 'Tempe, AZ', rate: 0.081, isDefault: false };

describe('LocationTaxJurisdiction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('EDIT_INVOICES'));
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/service-locations/loc-1/tax-jurisdiction')
        return Promise.resolve({ data: { serviceLocationId: 'loc-1', assignedJurisdictionId: null, effective: phoenix } });
      if (url === '/financial/tax-jurisdictions') return Promise.resolve({ data: [phoenix, tempe] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('shows the default when nothing is assigned, and assigns another', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { serviceLocationId: 'loc-1', assignedJurisdictionId: 'j-2', effective: tempe } });
    renderWithProviders(<LocationTaxJurisdiction serviceLocationId="loc-1" />);

    expect(await screen.findByText('Phoenix, AZ')).toBeInTheDocument();
    expect(screen.getByText('(default)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Tempe, AZ · 8.1%' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Jurisdiction' }), 'j-2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/service-locations/loc-1/tax-jurisdiction', { taxJurisdictionId: 'j-2' });
    expect(await screen.findByText('Tempe, AZ')).toBeInTheDocument();
    expect(screen.queryByText('(default)')).not.toBeInTheDocument();
  });

  it('hides Change without a pricing or quote/invoice edit capability', async () => {
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    renderWithProviders(<LocationTaxJurisdiction serviceLocationId="loc-1" />);

    expect(await screen.findByText('Phoenix, AZ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});
