import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CancelWorkOrderDialog from './CancelWorkOrderDialog';
import { apiClient } from '../api/setup';
import type { WorkOrderSummary } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const workOrder: WorkOrderSummary = {
  id: 'wo-1',
  workOrderNumber: 'WO-0001',
} as unknown as WorkOrderSummary;

describe('CancelWorkOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title and the work order number', () => {
    renderWithProviders(
      <CancelWorkOrderDialog isOpen={true} onClose={vi.fn()} workOrder={workOrder} />,
    );

    expect(screen.getByText(/cancel work order\?/i)).toBeInTheDocument();
    expect(screen.getByText('WO-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel work order/i })).toBeDisabled();
  });

  it('keeps the submit button disabled until a real reason is entered', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CancelWorkOrderDialog isOpen={true} onClose={vi.fn()} workOrder={workOrder} />,
    );

    const submit = screen.getByRole('button', { name: /cancel work order/i });
    expect(submit).toBeDisabled();

    // Whitespace only keeps the button disabled (the trim()-based guard).
    await user.type(screen.getByRole('textbox'), '   ');
    expect(submit).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('submits the cancel request and closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    renderWithProviders(
      <CancelWorkOrderDialog isOpen={true} onClose={onClose} workOrder={workOrder} />,
    );

    await user.type(screen.getByRole('textbox'), 'Customer rescheduled');
    await user.click(screen.getByRole('button', { name: /cancel work order/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/wo-1/cancel',
        { reason: 'Customer rescheduled' },
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows the API error message when the cancel request fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(
      Object.assign(new Error('Bad'), {
        response: { data: { message: 'Already cancelled.' } },
      }),
    );

    renderWithProviders(
      <CancelWorkOrderDialog isOpen={true} onClose={vi.fn()} workOrder={workOrder} />,
    );

    await user.type(screen.getByRole('textbox'), 'Customer rescheduled');
    await user.click(screen.getByRole('button', { name: /cancel work order/i }));

    expect(await screen.findByText('Already cancelled.')).toBeInTheDocument();
  });

  it('falls back to the generic error message when the API error is opaque', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network down'));

    renderWithProviders(
      <CancelWorkOrderDialog isOpen={true} onClose={vi.fn()} workOrder={workOrder} />,
    );

    await user.type(screen.getByRole('textbox'), 'Customer rescheduled');
    await user.click(screen.getByRole('button', { name: /cancel work order/i }));

    expect(await screen.findByText(/failed to cancel work order/i)).toBeInTheDocument();
  });
});
