import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import RatePlanPage from './RatePlanPage';
import { apiClient } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const rate = (id: string, name: string, billRate: number | null, active = true) => ({
  id, name, role: null, billRate, costRate: null, sortOrder: 0, active, createdAt: null, updatedAt: null,
});
const rates = [rate('r-reg', 'Regular', 95), rate('r-ot', 'Overtime', 142.5), rate('r-old', 'Saturday', 120, false)];
const existing = {
  id: 'p-dr', name: 'Desert Ridge', description: 'Negotiated contract', isDefault: false, priceMultiplier: 0.9, memberBenefitsStack: false, active: true,
  laborRates: [{ laborRateTypeId: 'r-reg', billRate: 115 }, { laborRateTypeId: 'r-old', billRate: 130 }],
  markupTiers: [{ minCost: 0, markupPct: 0.6 }, { minCost: 50, markupPct: 0.4 }],
  categoryMultipliers: [{ categoryId: 'c-1', priceMultiplier: 0.95 }], createdAt: null, updatedAt: '2026-10-13T00:00:00Z',
};

const routes = [
  { path: '/settings/rate-plans/new', element: <RatePlanPage /> },
  { path: '/settings/rate-plans/:id', element: <RatePlanPage /> },
  // eslint-disable-next-line i18next/no-literal-string
  { path: '/settings/rate-plans', element: <div>Plans list</div> },
];
const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));

describe('RatePlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/labor-rates') return Promise.resolve({ data: rates });
      if (url === '/financial/rate-plans/p-dr') return Promise.resolve({ data: existing });
      if (url === '/financial/rate-plans/p-dr/accounts')
        return Promise.resolve({
          data: { content: [{ customerId: 'cust-7', customerName: 'Desert Ridge Property Mgmt', assignedAt: '2026-09-01T00:00:00Z' }], totalPages: 1, page: 0 },
        });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('creates a plan with a custom labor rate, markup tiers and a discount', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...existing, name: 'Property managers' } });
    renderWithProviders(<div />, { routes, initialPath: '/settings/rate-plans/new' });

    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Property managers');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Overtime on this plan' }), 'custom');
    const ot = screen.getByRole('textbox', { name: 'Overtime rate on this plan' });
    await user.clear(ot);
    await user.type(ot, '150');
    await user.click(screen.getByRole('radio', { name: 'Cost + markup by cost range' }));
    const adjust = screen.getByRole('textbox', { name: 'Percent' });
    await user.clear(adjust);
    await user.type(adjust, '-10');
    expect(screen.getByText('$108.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/rate-plans', {
      name: 'Property managers', description: null, isDefault: false, priceMultiplier: 0.9, memberBenefitsStack: true, active: true,
      laborRates: [{ laborRateTypeId: 'r-ot', billRate: 150 }],
      markupTiers: [{ minCost: 0, markupPct: 0.6 }, { minCost: 50, markupPct: 0.35 }],
      categoryMultipliers: [],
    });
    expect(await screen.findByText('Plans list')).toBeInTheDocument();
  });

  it('keeps what the form doesn’t show when saving an edit', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: existing });
    renderWithProviders(<div />, { routes, initialPath: '/settings/rate-plans/p-dr' });

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await screen.findByRole('combobox', { name: 'Regular on this plan' });
    await user.clear(name);
    await user.type(name, 'Desert Ridge 2027');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/rate-plans/p-dr', {
      name: 'Desert Ridge 2027', description: 'Negotiated contract', isDefault: false, priceMultiplier: 0.9, memberBenefitsStack: false, active: true,
      // The override on a since-deactivated rate type stays.
      laborRates: [{ laborRateTypeId: 'r-reg', billRate: 115 }, { laborRateTypeId: 'r-old', billRate: 130 }],
      markupTiers: [{ minCost: 0, markupPct: 0.6 }, { minCost: 50, markupPct: 0.4 }],
      categoryMultipliers: [{ categoryId: 'c-1', priceMultiplier: 0.95 }],
    });
  });

  it('lists the plan’s accounts and unassigns one straight away', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { customerId: 'cust-7', assignedRatePlanId: null, effective: null } });
    renderWithProviders(<div />, { routes, initialPath: '/settings/rate-plans/p-dr' });

    expect(await screen.findByRole('link', { name: 'Desert Ridge Property Mgmt' })).toHaveAttribute('href', '/customers/cust-7');
    await user.click(screen.getByRole('button', { name: 'Unassign Desert Ridge Property Mgmt' }));
    expect(apiClient.put).toHaveBeenCalledWith('/financial/customers/cust-7/rate-plan', { ratePlanId: null });
  });

  it('won’t save tiers whose ranges don’t climb', async () => {
    const user = userEvent.setup();
    renderWithProviders(<div />, { routes, initialPath: '/settings/rate-plans/p-dr' });

    const upTo = await screen.findByRole('textbox', { name: 'Tier 1 up to' });
    await user.clear(upTo);
    await user.type(upTo, '0');
    expect(screen.getByText(/Each range has to end above where it starts/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('opens read-only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<div />, { routes, initialPath: '/settings/rate-plans/p-dr' });

    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
