import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import InvoiceDialog from './InvoiceDialog';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const renderDialog = (overrides: { open?: boolean; onClose?: () => void } = {}) => {
  const onClose = overrides.onClose ?? vi.fn();
  const utils = renderWithProviders(
    <InvoiceDialog
      open={overrides.open ?? true}
      onClose={onClose}
      workOrderId="wo-1"
      workOrderNumber="WO-00010"
      defaultCustomer={{ id: 'cust-1', name: 'Tenant 2 Inc.' }}
    />,
  );
  return { ...utils, onClose };
};

describe('InvoiceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title and prefills the bill-to with the default customer', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /new invoice/i })).toBeInTheDocument();
    const billTo = screen.getByLabelText(/bill to/i) as HTMLInputElement;
    expect(billTo.value).toBe('Tenant 2 Inc.');
  });

  it('shows the WO context strip with WO number and customer', () => {
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
    await user.type(screen.getByLabelText(/description/i), 'Diagnostic');
    await user.type(screen.getByLabelText(/^amount$/i), '0');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(
      await screen.findByText(/amount must be a positive number/i),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates the invoice as draft (no status update) on Save as Draft', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'i-1', status: 'DRAFT' },
    });
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Replace condenser');
    await user.type(screen.getByLabelText(/^amount$/i), '$5,000.00');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/invoices',
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

  it('sends invoice/due dates as LocalDate strings (yyyy-MM-dd), not Instants', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'i-1', status: 'DRAFT' },
    });
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Diagnostic');
    await user.type(screen.getByLabelText(/^amount$/i), '250');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
    });
    const body = vi.mocked(apiClient.post).mock.calls[0][1] as {
      invoiceDate: string;
      dueDate: string;
    };
    expect(body.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.invoiceDate).not.toContain('T');
    expect(body.dueDate).not.toContain('T');
  });

  it('on Save & Send creates the invoice, then calls /send (no chained status PATCH)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation((url: string) => {
      if (url === '/financial/invoices') {
        return Promise.resolve({
          data: { id: 'i-99', status: 'DRAFT' },
        });
      }
      if (url === '/financial/invoices/i-99/send') {
        return Promise.resolve({
          data: {
            notificationId: 'n-1',
            queuedAt: '2026-05-15T10:00:00Z',
            shareUrl: 'https://app.example/p/invoice/abc',
            lastSentToEmails: 'jane@example.com',
          },
        });
      }
      return Promise.reject(new Error(`Unexpected POST: ${url}`));
    });
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Replace condenser');
    await user.type(screen.getByLabelText(/^amount$/i), '1200');
    await user.click(screen.getByRole('button', { name: /save & send/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/invoices',
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/invoices/i-99/send',
        undefined,
      );
    });
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces friendly copy when /send rejects with NO_RECIPIENT', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation((url: string) => {
      if (url === '/financial/invoices') {
        return Promise.resolve({ data: { id: 'i-77', status: 'DRAFT' } });
      }
      if (url === '/financial/invoices/i-77/send') {
        return Promise.reject(
          Object.assign(new Error('Request failed with status 422'), {
            response: {
              data: { code: 'NO_RECIPIENT', message: 'No email on file' },
            },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected POST: ${url}`));
    });
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Tune up');
    await user.type(screen.getByLabelText(/^amount$/i), '450');
    await user.click(screen.getByRole('button', { name: /save & send/i }));
    expect(
      await screen.findByText(/add an email to the bill-to customer first/i),
    ).toBeInTheDocument();
  });

  it('passes the optional notes through when filled', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'i-1', status: 'DRAFT' },
    });
    renderDialog();
    await user.type(screen.getByLabelText(/description/i), 'Tune-up');
    await user.type(screen.getByLabelText(/^amount$/i), '199.99');
    await user.type(screen.getByLabelText(/^notes$/i), 'Per phone call w/ owner');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/invoices',
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
