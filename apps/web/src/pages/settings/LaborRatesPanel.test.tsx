import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import LaborRatesPanel from './LaborRatesPanel';
import { apiClient, type LaborRateType } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const rate = (over: Partial<LaborRateType>): LaborRateType => ({
  id: 'r-reg',
  name: 'Regular',
  role: 'REGULAR',
  billRate: 95,
  costRate: 38,
  sortOrder: 0,
  active: true,
  createdAt: null,
  updatedAt: null,
  ...over,
});

const regular = rate({});
const holiday = rate({ id: 'r-hol', name: 'Holiday', role: 'HOLIDAY', billRate: null, costRate: null, sortOrder: 3 });

const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));

describe('LaborRatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/labor-rates') return Promise.resolve({ data: [regular, holiday] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('lists rates with bill rate, internal cost and margin, flagging unpriced ones', async () => {
    renderWithProviders(<LaborRatesPanel />);

    expect(await screen.findByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('Default rate')).toBeInTheDocument();
    expect(screen.getByText('$95.00/hr')).toBeInTheDocument();
    expect(screen.getByText('$38.00/hr')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('2 active · 1 without a bill rate')).toBeInTheDocument();
  });

  it('adds a rate type at the end of the list', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: rate({ id: 'r-em', name: 'Emergency', role: null }) });
    renderWithProviders(<LaborRatesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add rate type' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Emergency');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bill rate ($/hr)' }), '195');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/labor-rates', {
      name: 'Emergency', billRate: 195, costRate: null, sortOrder: 4, active: true,
    });
  });

  it('deactivates a rate type by sending the whole type back; Regular cannot be deactivated', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...holiday, active: false } });
    renderWithProviders(<LaborRatesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Regular' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Holiday' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    expect(apiClient.put).toHaveBeenCalledWith('/financial/labor-rates/r-hol', {
      name: 'Holiday', billRate: null, costRate: null, sortOrder: 3, active: false,
    });
  });

  it('is read-only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<LaborRatesPanel />);

    expect(await screen.findByText('Regular')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rate type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Regular' })).not.toBeInTheDocument();
  });
});
