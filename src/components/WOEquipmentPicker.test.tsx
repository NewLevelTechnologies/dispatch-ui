import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WOEquipmentPicker from './WOEquipmentPicker';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('WOEquipmentPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the location equipment and fires onPick with the chosen id', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        content: [
          { id: 'eq-1', name: 'Rooftop unit', make: 'Trane', model: 'XR14', equipmentTypeName: 'Condenser' },
          { id: 'eq-2', name: 'Furnace', make: 'Carrier', model: '58TN0A080' },
        ],
      },
    } as never);

    renderWithProviders(<WOEquipmentPicker serviceLocationId="loc-1" onPick={onPick} />);

    await user.click(await screen.findByRole('button', { name: /rooftop unit/i }));
    expect(onPick).toHaveBeenCalledWith('eq-1');
  });

  it('shows the empty state when the location has no equipment', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } } as never);
    renderWithProviders(<WOEquipmentPicker serviceLocationId="loc-1" onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/on file at this location/i)).toBeInTheDocument());
  });

  it('shows Clear only when equipment is attached and detaches via onPick(null)', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } } as never);

    const { rerender } = renderWithProviders(
      <WOEquipmentPicker serviceLocationId="loc-1" onPick={onPick} />
    );
    // No attached value → no Clear.
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();

    rerender(<WOEquipmentPicker serviceLocationId="loc-1" value="eq-1" onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('renders the not-needed escape hatch and fires onNotNeeded', async () => {
    const onNotNeeded = vi.fn();
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } } as never);

    renderWithProviders(
      <WOEquipmentPicker serviceLocationId="loc-1" onPick={vi.fn()} onNotNeeded={onNotNeeded} />
    );
    await user.click(await screen.findByRole('button', { name: /doesn't need/i }));
    expect(onNotNeeded).toHaveBeenCalled();
  });

  it('renders Cancel and Add-new affordances and fires their callbacks', async () => {
    const onCancel = vi.fn();
    const onAddNew = vi.fn();
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } } as never);

    renderWithProviders(
      <WOEquipmentPicker serviceLocationId="loc-1" onPick={vi.fn()} onCancel={onCancel} onAddNew={onAddNew} />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /add new/i }));
    expect(onAddNew).toHaveBeenCalled();
  });
});
