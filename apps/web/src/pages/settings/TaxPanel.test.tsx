import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TaxPanel from './TaxPanel';
import { apiClient, type TaxJurisdiction } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const jurisdiction = (over: Partial<TaxJurisdiction>): TaxJurisdiction => ({
  id: 'j-1',
  name: 'Phoenix, AZ',
  rate: 0.086,
  taxesLabor: false,
  taxesMaterials: true,
  taxesEquipment: true,
  taxesFees: false,
  isDefault: true,
  active: true,
  createdAt: null,
  updatedAt: null,
  ...over,
});

const phoenix = jurisdiction({});
const tempe = jurisdiction({ id: 'j-2', name: 'Tempe, AZ', rate: null, isDefault: false });

function mockApi(list: TaxJurisdiction[]) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/financial/tax-jurisdictions') return Promise.resolve({ data: list });
    if (url === '/financial/pricing-settings') return Promise.resolve({ data: { agreementFeeTaxClass: 'FEE', updatedAt: null } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));

describe('TaxPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    mockApi([phoenix, tempe]);
  });

  it('lists jurisdictions with the default, the rate (or that it is not set) and what each taxes', async () => {
    renderWithProviders(<TaxPanel />);

    expect(await screen.findByText('Phoenix, AZ')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('8.6%')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
    // All four classes show; the untaxed ones say so.
    expect(screen.getAllByTitle('Materials is taxed')).toHaveLength(2);
    expect(screen.getAllByTitle('Labor is not taxed')).toHaveLength(2);
    expect(screen.getByText('Tempe, AZ has no rate. Locations using it are charged no tax.')).toBeInTheDocument();
  });

  it('adds a jurisdiction with the rate as a fraction', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: jurisdiction({ id: 'j-3' }) });
    renderWithProviders(<TaxPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add jurisdiction' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Mesa, AZ');
    await user.type(within(dialog).getByRole('textbox', { name: 'Rate (%)' }), '8.25');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Labor' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/tax-jurisdictions', {
      name: 'Mesa, AZ', rate: 0.0825, taxesLabor: true, taxesMaterials: true, taxesEquipment: true, taxesFees: false, isDefault: false, active: true,
    });
  });

  it('makes another jurisdiction the default, sending the whole jurisdiction back', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: tempe });
    renderWithProviders(<TaxPanel />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Tempe, AZ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Make default' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/tax-jurisdictions/j-2', {
      name: 'Tempe, AZ', rate: null, taxesLabor: false, taxesMaterials: true, taxesEquipment: true, taxesFees: false, isDefault: true, active: true,
    });
  });

  it('is read-only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<TaxPanel />);

    expect(await screen.findByText('Phoenix, AZ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add jurisdiction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Tempe, AZ' })).not.toBeInTheDocument();
    expect(screen.getByText('View only. Changing pricing needs the Manage pricing permission.')).toBeInTheDocument();
    expect(await screen.findByText('Tax class by line source')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /installments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set rate' })).not.toBeInTheDocument();
  });

  it('saves the agreement installment tax class as soon as it changes', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { agreementFeeTaxClass: 'LABOR', updatedAt: null } });
    renderWithProviders(<TaxPanel />);

    await user.selectOptions(await screen.findByRole('combobox', { name: /installments/ }), 'LABOR');
    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'LABOR' });
  });
});
