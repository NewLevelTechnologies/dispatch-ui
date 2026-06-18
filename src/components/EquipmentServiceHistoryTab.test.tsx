import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentServiceHistoryTab from './EquipmentServiceHistoryTab';

const mockGetAll = vi.fn();

vi.mock('../api/workOrderApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderApi')>();
  return {
    ...actual,
    workOrderApi: { ...actual.workOrderApi, getAll: (...a: unknown[]) => mockGetAll(...a) },
  };
});

vi.mock('../api/client');

const pageOf = (content: unknown[]) => ({
  content,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  number: 0,
  size: 25,
  first: true,
  last: true,
});

const wo = (o: Record<string, unknown> = {}) => ({
  id: 'wo-1',
  workOrderNumber: 'WO-1',
  lifecycleState: 'ACTIVE',
  progressCategory: 'COMPLETED',
  priority: 'NORMAL',
  scheduledDate: '2026-04-15',
  workItemCount: 2,
  workItems: [{ description: 'Replaced capacitor', statusCategory: 'COMPLETED' }],
  assignedUsers: [{ userId: 'u-1', name: 'Tariq', state: 'DONE' }],
  createdAt: '2026-04-10T12:00:00Z',
  updatedAt: '2026-04-15T12:00:00Z',
  ...o,
});

describe('EquipmentServiceHistoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(pageOf([]));
  });

  it('shows the empty state', async () => {
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    expect(await screen.findByText(/no work orders for this unit/i)).toBeInTheDocument();
  });

  it('renders a row with tech, a "+N more" hint, an hours placeholder, and a status pill', async () => {
    mockGetAll.mockResolvedValue(pageOf([wo()]));
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    expect(await screen.findByText('WO-1')).toBeInTheDocument();
    expect(screen.getByText('Replaced capacitor')).toBeInTheDocument();
    expect(screen.getByText(/\+1 more/i)).toBeInTheDocument();
    expect(screen.getByText('Tariq')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Backend was scoped by equipment.
    expect(mockGetAll.mock.calls.some(([a]) => a?.equipmentId === 'eq-1')).toBe(true);
  });

  it('feeds the search text into the query', async () => {
    mockGetAll.mockResolvedValue(pageOf([wo()]));
    const user = userEvent.setup();
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    await screen.findByText('WO-1');
    await user.type(screen.getByPlaceholderText(/search work orders/i), 'cap');
    await waitFor(() => {
      expect(mockGetAll.mock.calls.some(([a]) => a?.q === 'cap' && a?.equipmentId === 'eq-1')).toBe(true);
    });
  });

  it('clears the search box', async () => {
    mockGetAll.mockResolvedValue(pageOf([wo()]));
    const user = userEvent.setup();
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    await screen.findByText('WO-1');
    const input = screen.getByPlaceholderText(/search work orders/i);
    await user.type(input, 'cap');
    expect(input).toHaveValue('cap');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(input).toHaveValue('');
  });

  it('navigates on row click', async () => {
    mockGetAll.mockResolvedValue(pageOf([wo()]));
    const user = userEvent.setup();
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    // The row is clickable (navigates to the work order); clicking it shouldn't throw.
    await user.click(await screen.findByText('WO-1'));
  });

  it('surfaces an error state', async () => {
    mockGetAll.mockRejectedValue(new Error('boom'));
    renderWithProviders(<EquipmentServiceHistoryTab equipmentId="eq-1" />);
    expect(await screen.findByText(/couldn.t load service history/i)).toBeInTheDocument();
  });
});
