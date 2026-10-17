import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import PromotionsPanel from './PromotionsPanel';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import type { Promotion } from '../../api/setup';

const api = vi.hoisted(() => ({ getAll: vi.fn(), create: vi.fn(), update: vi.fn(), getCategories: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    promotionsApi: { ...actual.promotionsApi, getAll: api.getAll, create: api.create, update: api.update },
    pricebookApi: { ...actual.pricebookApi, getCategories: api.getCategories },
  };
});

const fall: Promotion = {
  id: 'p-1', name: 'Fall Comfort Event', customerCopy: '$500 off a new system', startsOn: '2026-10-01', endsOn: '2026-10-31',
  kind: 'AMOUNT', value: 500, minAmount: 8000, itemIds: [], categoryIds: ['cat-sys'], autoApply: true, active: true, onOffer: true,
  createdAt: '', updatedAt: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('MANAGE_PRICING'));
  api.getAll.mockResolvedValue([fall]);
  api.getCategories.mockResolvedValue([{ id: 'cat-sys', name: 'Systems' }, { id: 'cat-acc', name: 'Accessories' }]);
  api.create.mockResolvedValue({ ...fall, id: 'p-2', name: 'Duct month' });
  api.update.mockResolvedValue(fall);
});

describe('PromotionsPanel', () => {
  it('lists promotions: when they run, what comes off, what they cover, whether they’re on offer', async () => {
    renderWithProviders(<PromotionsPanel />);
    const [row] = await screen.findAllByTestId('promotion-row');
    expect(row).toHaveTextContent('Fall Comfort Event');
    expect(row).toHaveTextContent('$500.00');
    expect(row).toHaveTextContent('Systems');
    expect(row).toHaveTextContent('settings.promotions.status.onOffer');
  });

  it('adds a percent promotion, sent as a fraction, covering the ticked categories', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromotionsPanel />);

    await user.click(await screen.findByRole('button', { name: /settings.promotions.add/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('settings.promotions.form.name'), 'Duct month');
    await user.type(within(dialog).getByLabelText('settings.promotions.form.starts'), '2026-11-01');
    await user.type(within(dialog).getByLabelText('settings.promotions.form.ends'), '2026-11-30');
    await user.click(within(dialog).getByRole('radio', { name: 'settings.promotions.form.percentOff' }));
    await user.type(within(dialog).getByLabelText('settings.promotions.form.percent'), '15');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Accessories' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        name: 'Duct month', customerCopy: null, startsOn: '2026-11-01', endsOn: '2026-11-30', kind: 'PERCENT', value: 0.15,
        minAmount: null, itemIds: [], categoryIds: ['cat-acc'], autoApply: true, active: true,
      }),
    );
  });

  it('switches one off rather than deleting it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromotionsPanel />);

    await user.click((await screen.findAllByTestId('promotion-row'))[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: 'settings.promotions.form.active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('p-1', expect.objectContaining({ active: false, value: 500, minAmount: 8000 })));
  });

  it('is view only without MANAGE_PRICING', async () => {
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    renderWithProviders(<PromotionsPanel />);
    await screen.findAllByTestId('promotion-row');
    expect(screen.queryByRole('button', { name: /settings.promotions.add/ })).not.toBeInTheDocument();
  });
});
