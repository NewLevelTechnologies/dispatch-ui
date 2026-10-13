import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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

const apprentice = rate({ id: 'r-app', name: 'Apprentice', role: null, billRate: 85, costRate: 28, sortOrder: 5, active: false });
const plan = {
  id: 'p-1', name: 'Desert Ridge', isDefault: false, priceMultiplier: null, memberBenefitsStack: false, active: true,
  laborRates: [{ laborRateTypeId: 'r-reg', billRate: 115 }], markupTiers: [], categoryMultipliers: [], createdAt: null, updatedAt: null,
};
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));

describe('LaborRatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/labor-rates') return Promise.resolve({ data: [regular, holiday, apprentice] });
      if (url === '/financial/rate-plans') return Promise.resolve({ data: [plan] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('lists active rates with what each is for, bill rate, internal cost, margin and plan overrides', async () => {
    renderWithProviders(<LaborRatesPanel />);

    await screen.findByText('Regular');
    const reg = rowOf('Regular');
    expect(reg).toHaveTextContent('Default rate');
    expect(reg).toHaveTextContent('Used for regular hours');
    expect(reg).toHaveTextContent('$95.00/hr');
    expect(reg).toHaveTextContent('$38.00/hr');
    expect(reg).toHaveTextContent('60%');
    expect(await within(reg).findByText('1 plan')).toBeInTheDocument();
    expect(rowOf('Holiday')).toHaveTextContent('Not set');
    expect(screen.queryByText('Apprentice')).not.toBeInTheDocument();
  });

  it('shows inactive rates behind a toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LaborRatesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Show inactive (1)' }));
    expect(rowOf('Apprentice')).toHaveTextContent('Custom · picked by hand');
    expect(screen.getByRole('button', { name: 'Hide inactive (1)' })).toBeInTheDocument();
  });

  it('calls out a rate with no bill rate, and its fix opens that rate', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LaborRatesPanel />);

    expect(await screen.findByText('Holiday has no bill rate, so labor lines can’t use it until one is set.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set rate' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit Holiday');
  });

  it('warns that changing Regular reprices computed items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LaborRatesPanel />);

    await screen.findByText('Regular');
    await user.click(rowOf('Regular'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/reprices every computed pricebook item/)).not.toBeInTheDocument();
    const bill = within(dialog).getByRole('textbox', { name: 'Bill rate ($/hr)' });
    await user.clear(bill);
    await user.type(bill, '105');
    expect(within(dialog).getByText(/reprices every computed pricebook item/)).toBeInTheDocument();
    expect(within(dialog).getByText('64%')).toBeInTheDocument();
  });

  it('adds a rate type at the end of the list', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: rate({ id: 'r-em', name: 'Emergency', role: null }) });
    renderWithProviders(<LaborRatesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add rate' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Emergency');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bill rate ($/hr)' }), '195');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/labor-rates', {
      name: 'Emergency', billRate: 195, costRate: null, sortOrder: 6, active: true,
    });
  });

  it('deactivates a rate type by sending the whole type back; Regular cannot be deactivated', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...holiday, active: false } });
    renderWithProviders(<LaborRatesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Regular' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Holiday' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    expect(apiClient.put).toHaveBeenCalledWith('/financial/labor-rates/r-hol', {
      name: 'Holiday', billRate: null, costRate: null, sortOrder: 3, active: false,
    });
  });

  it('reorders by dragging, sending every rate type once', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [holiday, regular, apprentice] });
    renderWithProviders(<LaborRatesPanel />);
    await screen.findByText('Regular');

    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(rowOf('Holiday'), { dataTransfer });
    fireEvent.dragOver(rowOf('Regular'), { dataTransfer });
    fireEvent.drop(rowOf('Regular'), { dataTransfer });

    // Hidden inactive rates are still sent, so the server gets every type.
    await vi.waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/financial/labor-rates/reorder', { orderedIds: ['r-hol', 'r-reg', 'r-app'] }),
    );
  });

  it('reloads when the order was out of date', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      Object.assign(new Error('bad'), { response: { status: 400, data: { code: 'INVALID_REQUEST', message: 'server words' } } }),
    );
    renderWithProviders(<LaborRatesPanel />);
    await screen.findByText('Regular');

    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(rowOf('Holiday'), { dataTransfer });
    fireEvent.dragOver(rowOf('Regular'), { dataTransfer });
    fireEvent.drop(rowOf('Regular'), { dataTransfer });

    await vi.waitFor(() =>
      expect(vi.mocked(apiClient.get).mock.calls.filter(([u]) => u === '/financial/labor-rates').length).toBeGreaterThan(1),
    );
  });

  it('is read-only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<LaborRatesPanel />);

    expect(await screen.findByText('Regular')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rate type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Regular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Drag to reorder' })).not.toBeInTheDocument();
    expect(screen.getByText('View only. Changing pricing needs the Manage pricing permission.')).toBeInTheDocument();
    expect(screen.getByText(/Holiday has no bill rate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set rate' })).not.toBeInTheDocument();
  });
});
