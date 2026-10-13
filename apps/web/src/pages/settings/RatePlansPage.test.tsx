import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import RatePlansPage from './RatePlansPage';
import { apiClient, type RatePlan } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const plan = (over: Partial<RatePlan>): RatePlan => ({
  id: 'p-std', name: 'Standard', isDefault: true, priceMultiplier: null, memberBenefitsStack: true, active: true,
  laborRates: [], markupTiers: [], categoryMultipliers: [], createdAt: null, updatedAt: null, ...over,
});
const standard = plan({});
const desertRidge = plan({
  id: 'p-dr', name: 'Desert Ridge · Commercial T&M', description: 'Negotiated 2026 contract.', accountCount: 1, isDefault: false, memberBenefitsStack: false,
  laborRates: [{ laborRateTypeId: 'r-reg', billRate: 115 }, { laborRateTypeId: 'r-ot', billRate: 172.5 }],
  markupTiers: [{ minCost: 0, markupPct: 0.6 }, { minCost: 50, markupPct: 0.4 }, { minCost: 250, markupPct: 0.25 }],
  categoryMultipliers: [{ categoryId: 'c-1', priceMultiplier: 0.95 }],
});
const municipal = plan({ id: 'p-gov', name: 'Municipal & schools', isDefault: false, priceMultiplier: 0.95, accountCount: 3 });

const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('RatePlansPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/rate-plans') return Promise.resolve({ data: [desertRidge, municipal, standard] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('sums up what each plan does', async () => {
    renderWithProviders(<RatePlansPage />);

    await screen.findByText('Standard');
    expect(rowOf('Standard')).toHaveTextContent('Default');
    expect(rowOf('Standard')).toHaveTextContent('Standard rates');
    expect(rowOf('Standard')).toHaveTextContent('Catalog prices');
    const dr = rowOf('Desert Ridge · Commercial T&M');
    expect(dr).toHaveTextContent('2 rates overridden');
    expect(dr).toHaveTextContent('Cost + markup · 3 tiers');
    expect(dr).toHaveTextContent('Not applied');
    expect(dr).toHaveTextContent('Negotiated 2026 contract.');
    expect(dr).toHaveTextContent('1 account');
    expect(rowOf('Standard')).toHaveTextContent('Everyone else');
    expect(rowOf('Municipal & schools')).toHaveTextContent('3 accounts');
    expect(rowOf('Municipal & schools')).toHaveTextContent('−5% on everything else');
  });

  it('makes a plan the default by sending the whole plan back, rules included', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...desertRidge, isDefault: true } });
    renderWithProviders(<RatePlansPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Desert Ridge · Commercial T&M' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Make default' }));
    expect(apiClient.put).toHaveBeenCalledWith('/financial/rate-plans/p-dr', {
      name: 'Desert Ridge · Commercial T&M', description: 'Negotiated 2026 contract.', isDefault: true, priceMultiplier: null, memberBenefitsStack: false, active: true,
      laborRates: desertRidge.laborRates, markupTiers: desertRidge.markupTiers, categoryMultipliers: desertRidge.categoryMultipliers,
    });
  });

  it('can’t deactivate the default plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RatePlansPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Standard' }));
    expect(await screen.findByRole('menuitem', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('is view only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<RatePlansPage />);

    await screen.findByText('Standard');
    expect(screen.getByText('View only. Changing pricing needs the Manage pricing permission.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New rate plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Standard' })).not.toBeInTheDocument();
  });
});
