import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { SavingsCard } from './SavingsCard';
import { proposalQuote } from './proposalFixtures';
import type { Promotion, Quote } from '../../api/setup';

const api = vi.hoisted(() => ({ setPromotion: vi.fn(), addAdjustment: vi.fn(), deleteAdjustment: vi.fn(), getAll: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    quotesApi: { ...actual.quotesApi, setPromotion: api.setPromotion, addAdjustment: api.addAdjustment, deleteAdjustment: api.deleteAdjustment },
    promotionsApi: { ...actual.promotionsApi, getAll: api.getAll },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const run = vi.fn(async (fn: (version: number) => Promise<unknown>) => {
  await fn(4);
  return true;
});

const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: 'p-1', name: 'Fall Comfort Event', customerCopy: '$500 off a new system', startsOn: '2026-10-01', endsOn: '2026-10-31',
  kind: 'AMOUNT', value: 500, minAmount: 8000, itemIds: [], categoryIds: [], autoApply: true, active: true, onOffer: true,
  createdAt: '', updatedAt: '', ...over,
});

const renderCard = (quote: Quote = proposalQuote()) => renderWithProviders(<SavingsCard quote={quote} editable run={run} />);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
  for (const fn of [api.setPromotion, api.addAdjustment, api.deleteAdjustment]) fn.mockResolvedValue(proposalQuote());
  api.getAll.mockResolvedValue([promo(), promo({ id: 'p-2', name: 'Duct month', autoApply: false, kind: 'PERCENT', value: 0.15, minAmount: null })]);
});

describe('SavingsCard', () => {
  it('lists the promotions on offer and leaves an automatic one off this quote', async () => {
    const user = userEvent.setup();
    renderCard();

    const [fall, ducts] = await screen.findAllByTestId('proposal-promotion');
    expect(fall).toHaveTextContent('Promotion · Fall Comfort Event');
    expect(fall).toHaveTextContent('over $8,000.00');
    expect(fall).toHaveTextContent('$500.00 off');
    expect(ducts).toHaveTextContent('15% off');
    await user.click(within(fall).getByRole('button', { name: 'Don’t apply' }));
    expect(api.setPromotion).toHaveBeenCalledWith('q-1', 'p-1', { version: 4, choice: 'EXCLUDE' });
    await user.click(within(ducts).getByRole('button', { name: 'Apply' }));
    expect(api.setPromotion).toHaveBeenLastCalledWith('q-1', 'p-2', { version: 4, choice: 'APPLY' });
  });

  it('puts a left-off promotion back to its own setting', async () => {
    const user = userEvent.setup();
    renderCard(proposalQuote({ promotionOverrides: { 'p-1': 'EXCLUDE' } }));

    const [fall] = await screen.findAllByTestId('proposal-promotion');
    await user.click(within(fall).getByRole('button', { name: 'Apply' }));
    expect(api.setPromotion).toHaveBeenCalledWith('q-1', 'p-1', { version: 4, choice: null });
  });

  it('adds a decide-today saving that ends on a date', async () => {
    const user = userEvent.setup();
    renderCard();

    const row = screen.getByTestId('proposal-decide-today');
    await user.click(within(row).getByRole('switch', { name: 'Decide-today savings' }));
    await user.type(within(row).getByLabelText('Decide-today amount'), '350');
    expect(within(row).getByLabelText('Offered through')).toHaveValue('2026-10-12');
    await user.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.addAdjustment).toHaveBeenCalledWith('q-1', {
        version: 4, kind: 'AMOUNT', value: 350, reasonCode: 'INCENTIVE', validThrough: '2026-10-12',
      }),
    );
  });

  it('turns a decide-today saving off, and changes one by replacing it', async () => {
    const existing = {
      id: 'adj-9', lineId: null, kind: 'AMOUNT' as const, value: 350, reasonCode: 'INCENTIVE' as const, reasonNote: null,
      computedAmount: 350, createdByUserId: null, createdAt: null, sourceType: 'MANUAL' as const, validThrough: '2026-10-15',
    };
    const user = userEvent.setup();
    renderCard(proposalQuote({ adjustments: [existing] }));

    const row = screen.getByTestId('proposal-decide-today');
    expect(row).toHaveTextContent('approve by Oct 15');
    expect(row).toHaveTextContent('−$350.00');
    await user.click(within(row).getByRole('button', { name: 'Change' }));
    const amount = within(row).getByLabelText('Decide-today amount');
    await user.clear(amount);
    await user.type(amount, '400');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.addAdjustment).toHaveBeenCalledWith('q-1', expect.objectContaining({ value: 400, validThrough: '2026-10-15' })));
    expect(api.deleteAdjustment).toHaveBeenCalledWith('q-1', 'adj-9', 4);

    await user.click(within(row).getByRole('switch', { name: 'Decide-today savings' }));
    expect(api.deleteAdjustment).toHaveBeenCalledTimes(2);
  });
});
