import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PaymentDialog from './PaymentDialog';
import { apiClient } from '../api/setup';
import type { Invoice } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const mockInvoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-001',
  workOrderId: 'wo-1',
  customerId: 'cust-1',
  customerName: 'Acme Co',
  status: 'SENT',
  invoiceDate: '2024-01-01',
  dueDate: '2024-01-31',
  subtotalAmount: 100,
  taxAmount: 10,
  totalAmount: 110,
  amountPaid: 0,
  balanceDue: 110,
  lineItems: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
} as unknown as Invoice;

const mockSecondInvoice = {
  ...mockInvoice,
  id: 'inv-2',
  invoiceNumber: 'INV-002',
  balanceDue: 250,
} as unknown as Invoice;

const baseProps = {
  workOrderId: 'wo-1',
  workOrderNumber: 'WO-001',
  customerName: 'Acme Co',
  openInvoices: [mockInvoice, mockSecondInvoice],
  onClose: vi.fn(),
};

describe('PaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title when open', async () => {
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);
    // Title interpolates the payment glossary entry (default: "Payment").
    expect(
      await screen.findByRole('heading', { name: /Record Payment/i }),
    ).toBeInTheDocument();
  });

  it('renders the invoice picker with one option per invoice', async () => {
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);
    await screen.findByDisplayValue('110');
    const invoiceSelect = document.querySelector(
      'select[name="invoice"]',
    ) as HTMLSelectElement;
    const options = invoiceSelect.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0]).toHaveValue('inv-1');
    expect(options[1]).toHaveValue('inv-2');
  });

  it('hides the invoice picker when locked invoice is provided', async () => {
    renderWithProviders(
      <PaymentDialog
        open={true}
        {...baseProps}
        lockedInvoice={mockInvoice}
        openInvoices={[]}
      />,
    );
    await screen.findByText(/INV-001/);
    expect(document.querySelector('select[name="invoice"]')).toBeNull();
  });

  it('shows the no-open-invoices message when none exist and no locked invoice', async () => {
    renderWithProviders(
      <PaymentDialog open={true} {...baseProps} openInvoices={[]} />,
    );
    expect(
      await screen.findByText(/No outstanding/i),
    ).toBeInTheDocument();
  });

  it('disables the submit button when there are no open invoices', async () => {
    renderWithProviders(
      <PaymentDialog open={true} {...baseProps} openInvoices={[]} />,
    );
    // Submit button label is "Record Payment" — same text as title; getAllByRole.
    await screen.findByText(/No outstanding/i);
    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    expect(submitButtons[submitButtons.length - 1]).toBeDisabled();
  });

  it('seeds the amount field from the first invoice balance', async () => {
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('110')).toBeInTheDocument();
    });
  });

  it('re-seeds the amount when the invoice picker changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);
    await screen.findByDisplayValue('110');

    // The invoice select is the FIRST native select; the method select is
    // the second. Use a stable selector — query by name attribute.
    const invoiceSelect = document.querySelector(
      'select[name="invoice"]',
    ) as HTMLSelectElement;
    await user.selectOptions(invoiceSelect, 'inv-2');

    await waitFor(() => {
      expect(screen.getByDisplayValue('250')).toBeInTheDocument();
    });
  });

  it('lets the user edit the amount field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    const amount = await screen.findByDisplayValue('110');
    await user.clear(amount);
    await user.type(amount, '75.50');
    expect(amount).toHaveValue('75.50');
  });

  it('submits the form and calls the payments API', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'pay-1' },
    });
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    await screen.findByDisplayValue('110');
    // Submit (footer button) is the LAST "Record Payment" element.
    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/payments',
        expect.objectContaining({
          customerId: 'cust-1',
          amount: 110,
          paymentMethod: 'CHECK',
        }),
      );
    });
  });

  it('shows an error when amount is invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    const amount = await screen.findByDisplayValue('110');
    await user.clear(amount);
    await user.type(amount, '0');

    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(/Amount must be a positive number/i),
      ).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('closes the dialog when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <PaymentDialog open={true} {...baseProps} onClose={onClose} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the user pick a different payment method', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    await screen.findByDisplayValue('110');
    const methodSelect = document.querySelector(
      'select[name="method"]',
    ) as HTMLSelectElement;
    await user.selectOptions(methodSelect, 'CASH');
    expect(methodSelect).toHaveValue('CASH');
  });

  it('passes reference number to the API on submit', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'pay-1' },
    });
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    await screen.findByDisplayValue('110');
    const refInput = screen.getByPlaceholderText(
      /Check number, transaction id/i,
    );
    await user.type(refInput, 'CHK-9001');

    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/payments',
        expect.objectContaining({ referenceNumber: 'CHK-9001' }),
      );
    });
  });

  it('shows a friendly error when the API rejects', async () => {
    const err = new Error('boom') as Error & {
      response: { data: { message: string } };
    };
    err.response = { data: { message: 'Server says no' } };
    vi.mocked(apiClient.post).mockRejectedValue(err);

    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    await screen.findByDisplayValue('110');
    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Server says no')).toBeInTheDocument();
    });
  });

  it('falls back to the generic error when the API gives no message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithProviders(<PaymentDialog open={true} {...baseProps} />);

    await screen.findByDisplayValue('110');
    const submitButtons = screen.getAllByRole('button', {
      name: /Record Payment/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to record/i),
      ).toBeInTheDocument();
    });
  });
});
