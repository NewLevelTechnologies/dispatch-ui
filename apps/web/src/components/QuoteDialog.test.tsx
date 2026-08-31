import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import QuoteDialog from './QuoteDialog';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const renderDialog = (overrides: { open?: boolean; onClose?: () => void } = {}) => {
  const onClose = overrides.onClose ?? vi.fn();
  const utils = renderWithProviders(
    <QuoteDialog
      open={overrides.open ?? true}
      onClose={onClose}
      workOrderId="wo-1"
      workOrderNumber="WO-00010"
      defaultCustomer={{ id: 'cust-1', name: 'Tenant 2 Inc.' }}
    />,
  );
  return { ...utils, onClose };
};

describe('QuoteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title and prefills the bill-to with the default customer', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /new quote/i })).toBeInTheDocument();
    // CustomerPicker renders the selected name as the input value.
    const billTo = screen.getByLabelText(/bill to/i) as HTMLInputElement;
    expect(billTo.value).toBe('Tenant 2 Inc.');
  });

  it('shows the work-order context strip with WO number and customer', () => {
    renderDialog();
    expect(screen.getByText(/WO-00010/)).toBeInTheDocument();
    expect(screen.getByText(/Tenant 2 Inc\./)).toBeInTheDocument();
  });

  it('blocks submit and shows an error when description is empty', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^amount$/i), '500');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(
      await screen.findByText(/description is required/i),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('blocks submit and shows an error when amount is not a positive number', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Replace condenser');
    await user.type(screen.getByLabelText(/^amount$/i), '0');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(
      await screen.findByText(/amount must be a positive number/i),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates the quote as draft (no status update) on Save as Draft', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'q-1', status: 'DRAFT' },
    });
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Replace condenser');
    await user.type(screen.getByLabelText(/^amount$/i), '$5,000.00');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/quotes',
        expect.objectContaining({
          workOrderId: 'wo-1',
          customerId: 'cust-1',
          taxRate: 0,
          lineItems: [
            expect.objectContaining({
              description: 'Replace condenser',
              quantity: 1,
              unitPrice: 5000,
            }),
          ],
        }),
      );
    });
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends quote/expiration dates as LocalDate strings (yyyy-MM-dd), not Instants', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'q-1', status: 'DRAFT' },
    });
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Diagnostic');
    await user.type(screen.getByLabelText(/^amount$/i), '250');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
    });
    const body = vi.mocked(apiClient.post).mock.calls[0][1] as {
      quoteDate: string;
      expirationDate: string;
    };
    expect(body.quoteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.expirationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.quoteDate).not.toContain('T');
    expect(body.expirationDate).not.toContain('T');
  });

  it('on Save & Send creates the quote, then patches status to SENT', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'q-99', status: 'DRAFT' },
    });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { id: 'q-99', status: 'SENT' },
    });
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Replace condenser');
    await user.type(screen.getByLabelText(/^amount$/i), '1200');
    await user.click(screen.getByRole('button', { name: /save & send/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/quotes',
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/financial/quotes/q-99/status',
        { status: 'SENT' },
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('passes the optional notes through when filled', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'q-1', status: 'DRAFT' },
    });
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Tune-up');
    await user.type(screen.getByLabelText(/^amount$/i), '199.99');
    await user.type(screen.getByLabelText(/^notes$/i), 'Per phone call w/ owner');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/quotes',
        expect.objectContaining({ notes: 'Per phone call w/ owner' }),
      );
    });
  });

  it('shows the backend error message when create fails', async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error('boom'), {
      response: { data: { message: 'Customer is on credit hold' } },
    });
    vi.mocked(apiClient.post).mockRejectedValue(err);
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Service call');
    await user.type(screen.getByLabelText(/^amount$/i), '150');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(
      await screen.findByText(/customer is on credit hold/i),
    ).toBeInTheDocument();
  });

  it('closes the dialog on Cancel without calling the API', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
