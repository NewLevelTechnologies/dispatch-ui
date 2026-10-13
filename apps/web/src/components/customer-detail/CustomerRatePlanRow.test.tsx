import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { CustomerRatePlanRow } from './CustomerRatePlanRow';
import { apiClient } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const plan = (id: string, name: string, isDefault = false, active = true) => ({
  id, name, isDefault, priceMultiplier: null, memberBenefitsStack: true, active,
  laborRates: [], markupTiers: [], categoryMultipliers: [], createdAt: null, updatedAt: null,
});

describe('CustomerRatePlanRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('MANAGE_PRICING'));
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/customers/cust-1/rate-plan')
        return Promise.resolve({ data: { customerId: 'cust-1', assignedRatePlanId: null, effective: { id: 'p-std', name: 'Standard' } } });
      if (url === '/financial/rate-plans')
        return Promise.resolve({ data: [plan('p-std', 'Standard', true), plan('p-gov', 'Municipal'), plan('p-old', 'Old plan', false, false)] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('shows the default when nothing is assigned, and assigns an active plan', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { customerId: 'cust-1', assignedRatePlanId: 'p-gov', effective: { id: 'p-gov', name: 'Municipal' } },
    });
    renderWithProviders(<CustomerRatePlanRow customerId="cust-1" />);

    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('(default)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Municipal' });
    expect(within(dialog).queryByRole('option', { name: /Old plan/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Plan' }), 'p-gov');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/customers/cust-1/rate-plan', { ratePlanId: 'p-gov' });
    expect(await screen.findByText('Municipal')).toBeInTheDocument();
  });

  it('hides Change without MANAGE_PRICING', async () => {
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    renderWithProviders(<CustomerRatePlanRow customerId="cust-1" />);

    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});
