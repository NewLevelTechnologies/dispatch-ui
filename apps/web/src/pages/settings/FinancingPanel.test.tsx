import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import FinancingPanel from './FinancingPanel';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

const api = vi.hoisted(() => ({ getAll: vi.fn(), create: vi.fn(), update: vi.fn(), settings: vi.fn(), saveSettings: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    paymentPlansApi: { getAll: api.getAll, create: api.create, update: api.update },
    taxApi: { ...actual.taxApi, getPricingSettings: api.settings, updatePricingSettings: api.saveSettings },
  };
});

const plan = { id: 'pp-1', label: '12 months same as cash', apr: 0, months: 12, sortOrder: 1, active: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('MANAGE_PRICING'));
  api.getAll.mockResolvedValue([plan]);
  api.settings.mockResolvedValue({ agreementFeeTaxClass: 'FEE', financingApplicationUrl: null, updatedAt: null });
  api.create.mockResolvedValue({ ...plan, id: 'pp-2', label: '60 months' });
  api.update.mockResolvedValue(plan);
  api.saveSettings.mockResolvedValue({ agreementFeeTaxClass: 'FEE', financingApplicationUrl: 'https://apply.lender.com', updatedAt: null });
});

describe('FinancingPanel', () => {
  it('lists the lender’s plans', async () => {
    renderWithProviders(<FinancingPanel />);
    const [row] = await screen.findAllByTestId('payment-plan-row');
    expect(row).toHaveTextContent('12 months same as cash');
    expect(row).toHaveTextContent('0%');
  });

  it('adds a plan with its APR as a percent and its term', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancingPanel />);

    await user.click(await screen.findByRole('button', { name: /settings.financing.add/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('settings.financing.form.label'), '60 months');
    await user.type(within(dialog).getByLabelText('settings.financing.form.apr'), '9.99');
    await user.type(within(dialog).getByLabelText('settings.financing.form.months'), '60');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ label: '60 months', apr: 9.99, months: 60, sortOrder: 2, active: true }));
  });

  it('saves the lender’s application link, https only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancingPanel />);

    const url = await screen.findByLabelText('settings.financing.link.label');
    await user.type(url, 'http://apply.lender.com');
    expect(screen.getByText('settings.financing.link.invalid')).toBeInTheDocument();
    await user.clear(url);
    await user.type(url, 'https://apply.lender.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith('FEE', undefined, { financingApplicationUrl: 'https://apply.lender.com' }),
    );
  });
});
