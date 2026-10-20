import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { PaymentOptionsCard } from './PaymentOptionsCard';
import { pricedSelection, proposalQuote } from './proposalFixtures';

const api = vi.hoisted(() => ({ getAll: vi.fn(), setPaymentPlans: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    paymentPlansApi: { ...actual.paymentPlansApi, getAll: api.getAll },
    quotesApi: { ...actual.quotesApi, setPaymentPlans: api.setPaymentPlans },
  };
});

const run = vi.fn(async (fn: (version: number) => Promise<unknown>) => {
  await fn(4);
  return true;
});

beforeEach(() => {
  vi.clearAllMocks();
  api.setPaymentPlans.mockResolvedValue(proposalQuote());
  api.getAll.mockResolvedValue([
    { id: 'pp-1', label: '12 months same as cash', apr: 0, months: 12, sortOrder: 1, active: true },
    { id: 'pp-2', label: '60 months', apr: 9.99, months: 60, sortOrder: 2, active: true },
    { id: 'pp-3', label: 'Old plan', apr: 5, months: 24, sortOrder: 3, active: false },
  ]);
});

describe('PaymentOptionsCard', () => {
  it('offers every active plan by default, each with its monthly payment, and takes one off', async () => {
    const priced = pricedSelection({
      financing: {
        plans: [
          { planId: 'pp-1', label: '12 months same as cash', apr: 0, months: 12, monthlyPayment: 1347.5 },
          { planId: 'pp-2', label: '60 months', apr: 9.99, months: 60, monthlyPayment: 343.49 },
        ],
        selectedPlanId: null, monthlyPayment: null, applicationUrl: null,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PaymentOptionsCard quote={proposalQuote()} editable run={run} priced={priced} />);

    const rows = await screen.findAllByTestId('proposal-payment-plan');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('$343.49/mo');
    expect(rows[1]).toHaveTextContent('9.99% APR · 60 months');
    await user.click(within(rows[0]).getByRole('checkbox'));
    await waitFor(() => expect(api.setPaymentPlans).toHaveBeenCalledWith('q-1', { version: 4, planIds: ['pp-2'] }));
  });

  it('goes back to offering every plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentOptionsCard quote={proposalQuote({ paymentPlanIds: ['pp-2'] })} editable run={run} />);
    await user.click(await screen.findByRole('button', { name: 'Offer every plan' }));
    expect(api.setPaymentPlans).toHaveBeenCalledWith('q-1', { version: 4, planIds: null });
  });
});
