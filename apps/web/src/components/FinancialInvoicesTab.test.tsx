import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import FinancialInvoicesTab from './FinancialInvoicesTab';
import { apiClient } from '../api/setup';
import type { Invoice } from '../api/setup';

vi.mock('@dispatch/api/src/client');

// Backend ships monetary fields as BigDecimal strings even though the
// existing Invoice type declares them as `number`. Cast through unknown so
// the fixture matches runtime reality.
const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  customerId: 'cust-1',
  workOrderId: 'wo-1',
  invoiceNumber: 'INV-0042',
  status: 'SENT',
  invoiceDate: '2026-05-10T00:00:00Z',
  dueDate: '2026-06-09T00:00:00Z',
  subtotal: '1500.00' as unknown as number,
  taxRate: '0.00' as unknown as number,
  taxAmount: '0.00' as unknown as number,
  totalAmount: '1500.00' as unknown as number,
  amountPaid: '500.00' as unknown as number,
  balanceDue: '1000.00' as unknown as number,
  notes: undefined,
  lineItems: [
    {
      id: 'li-1',
      description: 'Diagnostic',
      quantity: '1.00' as unknown as number,
      unitPrice: '1500.00' as unknown as number,
      lineTotal: '1500.00' as unknown as number,
    },
  ],
  payments: [],
  createdAt: '2026-05-10T14:23:11Z',
  updatedAt: '2026-05-10T14:23:11Z',
  ...overrides,
});

const renderTab = () =>
  renderWithProviders(
    <FinancialInvoicesTab
      workOrderId="wo-1"
      workOrderNumber="WO-00010"
      customerId="cust-1"
      customerName="Tenant 2 Inc."
    />,
  );

describe('FinancialInvoicesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state with a + New Invoice button when the WO has no invoices', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    renderTab();
    expect(
      await screen.findByText(/No invoices on this work order yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new invoice/i }),
    ).toBeInTheDocument();
  });

  it('renders an invoice row with formatted money and date columns', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
    renderTab();
    expect(await screen.findByText('INV-0042')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('May 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jun 9, 2026')).toBeInTheDocument();
  });

  it('uses the WO-scoped endpoint, not the customer endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    renderTab();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/financial/work-orders/wo-1/invoices',
      );
    });
  });

  it('expands a row to show line items when the chevron is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
    renderTab();
    const expandBtn = await screen.findByRole('button', { name: /show line items/i });
    await user.click(expandBtn);
    expect(screen.getByText('Line items')).toBeInTheDocument();
    expect(screen.getByText('Diagnostic')).toBeInTheDocument();
  });

  it('lets the user change status via the inline status pill (DRAFT → SENT)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [makeInvoice({ status: 'DRAFT' })],
    });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: makeInvoice({ status: 'SENT' }),
    });
    renderTab();
    const pillButton = await screen.findByRole('button', { name: /change status/i });
    await user.click(pillButton);
    await user.click(await screen.findByRole('menuitem', { name: /^sent$/i }));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/financial/invoices/inv-1/status',
        { status: 'SENT' },
      );
    });
  });

  it('marks an invoice paid via the ⋯ menu', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [makeInvoice({ status: 'SENT' })],
    });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: makeInvoice({ status: 'PAID' }),
    });
    renderTab();
    await screen.findByText('INV-0042');
    const overflow = screen
      .getAllByRole('button', { name: /more options/i })
      .at(-1)!;
    await user.click(overflow);
    await user.click(await screen.findByRole('menuitem', { name: /mark paid/i }));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/financial/invoices/inv-1/status',
        { status: 'PAID' },
      );
    });
  });

  it('voids an invoice via the ⋯ menu with a Catalyst confirmation dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: makeInvoice({ status: 'VOID' }),
    });
    renderTab();
    await screen.findByText('INV-0042');
    const overflow = screen
      .getAllByRole('button', { name: /more options/i })
      .at(-1)!;
    await user.click(overflow);
    await user.click(await screen.findByRole('menuitem', { name: /void/i }));
    // Dialog opens. Click the confirm button — destructive Catalyst Button
    // with the rose color. Use the role+name query.
    const confirmButton = await screen.findByRole('button', {
      name: /^void invoice$/i,
    });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/financial/invoices/inv-1/status',
        { status: 'VOID' },
      );
    });
    // No revoke call when the checkbox is left at its default OFF.
    expect(apiClient.post).not.toHaveBeenCalledWith(
      '/financial/invoices/inv-1/share-link/revoke',
    );
  });

  it('voids and revokes the share link when the checkbox is checked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        makeInvoice({
          status: 'SENT',
          // lastSentAt non-null surfaces the "Revoke" checkbox per §6.4.
          // Cast through `unknown` because the test fixture's `makeInvoice`
          // type is intentionally tight and doesn't include the optional
          // share-link-derived fields.
          ...({
            lastSentAt: '2026-05-15T10:00:00Z',
            lastSentToEmails: 'jane@example.com',
          } as unknown as Record<string, never>),
        }),
      ],
    });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: makeInvoice({ status: 'VOID' }),
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });
    renderTab();
    await screen.findByText('INV-0042');
    const overflow = screen
      .getAllByRole('button', { name: /more options/i })
      .at(-1)!;
    await user.click(overflow);
    await user.click(await screen.findByRole('menuitem', { name: /void/i }));
    const checkbox = await screen.findByRole('checkbox', {
      name: /revoke the share link/i,
    });
    await user.click(checkbox);
    await user.click(
      await screen.findByRole('button', { name: /^void invoice$/i }),
    );
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/financial/invoices/inv-1/status',
        { status: 'VOID' },
      );
    });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/financial/invoices/inv-1/share-link/revoke',
      );
    });
  });

  it('hides the revoke checkbox when the invoice has never been sent', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [makeInvoice({ status: 'DRAFT' })],
    });
    renderTab();
    await screen.findByText('INV-0042');
    const overflow = screen
      .getAllByRole('button', { name: /more options/i })
      .at(-1)!;
    await user.click(overflow);
    await user.click(await screen.findByRole('menuitem', { name: /void/i }));
    await screen.findByRole('button', { name: /^void invoice$/i });
    expect(
      screen.queryByRole('checkbox', { name: /revoke the share link/i }),
    ).not.toBeInTheDocument();
  });

  describe('Send / Reissue / Extend (Phase 7 §6.4)', () => {
    const sentInvoice = () =>
      makeInvoice({
        status: 'SENT',
        ...({
          lastSentAt: '2026-05-15T10:00:00Z',
          lastSentToEmails: 'jane@example.com',
        } as unknown as Record<string, never>),
      });

    it('renders the lastSent metadata under the invoice number', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      renderTab();
      await screen.findByText('INV-0042');
      expect(screen.getByText(/last sent/i)).toBeInTheDocument();
      expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
    });

    it('shows Send for never-sent rows and Resend once lastSentAt is set', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      expect(
        await screen.findByRole('menuitem', { name: /^resend$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /reissue link/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /extend link expiry/i }),
      ).toBeInTheDocument();
    });

    it('POSTs to /send when Resend is clicked, surfacing a success banner', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          notificationId: 'n-1',
          queuedAt: '2026-05-15T10:00:00Z',
          shareUrl: 'https://app.example/p/invoice/abc',
          lastSentToEmails: 'jane@example.com',
        },
      });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(await screen.findByRole('menuitem', { name: /^resend$/i }));
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/invoices/inv-1/send',
          undefined,
        );
      });
      // Success banner shows up with role=status.
      const banner = await screen.findByRole('status');
      expect(banner).toHaveTextContent(/INV-0042/);
    });

    it('surfaces NO_RECIPIENT error as friendly copy', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice({ status: 'DRAFT' })] });
      vi.mocked(apiClient.post).mockRejectedValue(
        Object.assign(new Error('Request failed with status 422'), {
          response: {
            data: { code: 'NO_RECIPIENT', message: 'No email on file' },
          },
        }),
      );
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(await screen.findByRole('menuitem', { name: /^send$/i }));
      expect(
        await screen.findByText(/add an email to the bill-to customer first/i),
      ).toBeInTheDocument();
    });

    it('POSTs to /share-link/reissue with confirmation', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { shareUrl: 'https://app.example/p/invoice/new' },
      });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(
        await screen.findByRole('menuitem', { name: /reissue link/i }),
      );
      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/invoices/inv-1/share-link/reissue',
        );
      });
      confirmSpy.mockRestore();
    });

    it('POSTs to /share-link/extend with confirmation', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { expiresAt: '2027-05-15T10:00:00Z' },
      });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(
        await screen.findByRole('menuitem', { name: /extend link expiry/i }),
      );
      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/invoices/inv-1/share-link/extend',
        );
      });
      confirmSpy.mockRestore();
    });

    it('skips reissue when the confirmation dialog is dismissed', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(
        await screen.findByRole('menuitem', { name: /reissue link/i }),
      );
      expect(apiClient.post).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('retries revoke once on transient failure during void-and-revoke', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [sentInvoice()] });
      vi.mocked(apiClient.patch).mockResolvedValue({
        data: makeInvoice({ status: 'VOID' }),
      });
      // First revoke fails, second succeeds (the implementation's
      // single idempotent retry per backend's documented recovery).
      const post = vi.mocked(apiClient.post);
      post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: undefined });
      renderTab();
      await screen.findByText('INV-0042');
      const overflow = screen
        .getAllByRole('button', { name: /more options/i })
        .at(-1)!;
      await user.click(overflow);
      await user.click(await screen.findByRole('menuitem', { name: /void/i }));
      const checkbox = await screen.findByRole('checkbox', {
        name: /revoke the share link/i,
      });
      await user.click(checkbox);
      await user.click(
        await screen.findByRole('button', { name: /^void invoice$/i }),
      );
      await waitFor(() => {
        expect(post).toHaveBeenCalledTimes(2);
      });
      // Both calls targeted the revoke endpoint — the first failed,
      // the second succeeded. No error banner surfaces.
      expect(
        screen.queryByText(/couldn't revoke the share link/i),
      ).not.toBeInTheDocument();
    });
  });

  it('hides the status pill dropdown and ⋯ menu for terminal statuses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [makeInvoice({ status: 'VOID' })],
    });
    renderTab();
    await screen.findByText('INV-0042');
    expect(
      screen.queryByRole('button', { name: /change status/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /more options/i }),
    ).not.toBeInTheDocument();
  });

  it('renders voided rows in the audit list (per ask #2 contract)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        makeInvoice({ id: 'inv-1', invoiceNumber: 'INV-A', status: 'SENT' }),
        makeInvoice({ id: 'inv-2', invoiceNumber: 'INV-VOID', status: 'VOID' }),
      ],
    });
    renderTab();
    expect(await screen.findByText('INV-A')).toBeInTheDocument();
    expect(screen.getByText('INV-VOID')).toBeInTheDocument();
  });

  describe('Payments fold inside invoice expansion (§3.3 / ask #2 nested)', () => {
    const makeNestedPayment = (
      overrides: Partial<Invoice['payments'][0]> = {},
    ): Invoice['payments'][0] => ({
      id: 'pay-1',
      paymentNumber: 'PAY-X9Y1',
      paymentDate: '2026-05-12T00:00:00Z',
      amount: '300.00' as unknown as number,
      paymentMethod: 'CHECK',
      status: 'RECEIVED',
      referenceNumber: '1234',
      notes: undefined,
      createdAt: '2026-05-12T14:23:11Z',
      updatedAt: '2026-05-12T14:23:11Z',
      ...overrides,
    });

    const withPayments = (extraPayments = {}) =>
      makeInvoice({
        payments: [makeNestedPayment(extraPayments)],
      });

    it('renders nested payments inside the expanded invoice row', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [withPayments()] });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      expect(screen.getByText('Payments')).toBeInTheDocument();
      expect(screen.getByText('PAY-X9Y1')).toBeInTheDocument();
      expect(screen.getByText('Check')).toBeInTheDocument();
      expect(screen.getByText('$300.00')).toBeInTheDocument();
      expect(screen.getByText('1234')).toBeInTheDocument();
    });

    it('shows the "no payments" empty state when the invoice has none', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      expect(
        screen.getByText(/No payments recorded against this invoice/i),
      ).toBeInTheDocument();
    });

    it('mutes voided payment rows', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [withPayments({ status: 'VOID' })],
      });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      const paymentRow = screen.getByText('PAY-X9Y1').closest('tr');
      expect(paymentRow?.className).toMatch(/opacity-50/);
    });

    it('voids a payment via the ⋯ menu with cascade-aware confirmation', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(apiClient.get).mockResolvedValue({ data: [withPayments()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        status: 200,
        data: {
          id: 'pay-1',
          status: 'VOID',
        },
      });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      // The ⋯ button next to the payment row (last "more options" on the
      // page since the invoice row's ⋯ comes first in DOM order).
      const overflows = screen.getAllByRole('button', { name: /more options/i });
      await user.click(overflows.at(-1)!);
      await user.click(await screen.findByRole('menuitem', { name: /void payment/i }));

      // Confirmation copy is honest about the cascade.
      expect(confirmSpy).toHaveBeenCalledWith(
        // Glossary substitutes entity/parent → "payment" / "invoice".
        expect.stringMatching(/reverses the full payment from every invoice/i),
      );
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/payments/pay-1/void',
        );
      });
      confirmSpy.mockRestore();
    });

    it('hides the ⋯ menu on already-VOID payment rows', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [withPayments({ status: 'VOID' })],
      });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      // The only overflow buttons on the page should be the invoice-row
      // one(s) — not the payment row.
      const overflows = screen.getAllByRole('button', { name: /more options/i });
      for (const btn of overflows) {
        await user.click(btn);
        // None of the open menus should offer "Void payment"
        expect(
          screen.queryByRole('menuitem', { name: /void payment/i }),
        ).not.toBeInTheDocument();
        // Close it (click elsewhere).
        await user.keyboard('{Escape}');
      }
    });

    it('treats a 204 void response as a no-op (cross-tenant / not-found)', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(apiClient.get).mockResolvedValue({ data: [withPayments()] });
      vi.mocked(apiClient.post).mockResolvedValue({ status: 204, data: '' });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      const overflows = screen.getAllByRole('button', { name: /more options/i });
      await user.click(overflows.at(-1)!);
      await user.click(await screen.findByRole('menuitem', { name: /void payment/i }));
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/payments/pay-1/void',
        );
      });
      // The mutation completes without throwing; the query invalidation
      // is the only observable side-effect (covered by the integration
      // chain — refetch happens regardless of 200 vs 204).
      confirmSpy.mockRestore();
    });
  });

  describe('New Invoice flow (Phase 7 §4.2)', () => {
    it('opens the lump-sum dialog from the tab-level + New Invoice button', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      renderTab();
      const cta = await screen.findByRole('button', { name: /new invoice/i });
      await user.click(cta);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      // Locked context strip surfaces the WO + customer.
      expect(screen.getByText(/Work Order #WO-00010/)).toBeInTheDocument();
      expect(screen.getByText(/Tenant 2 Inc\./)).toBeInTheDocument();
    });

    it('posts a single lump-sum line item on Save as Draft', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { id: 'inv-new', status: 'DRAFT' },
      });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /new invoice/i }));

      await user.type(
        screen.getByRole('textbox', { name: /description/i }),
        'Service call',
      );
      await user.type(screen.getByRole('textbox', { name: /amount/i }), '350');
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
                description: 'Service call',
                quantity: 1,
                unitPrice: 350,
              }),
            ],
          }),
        );
      });
      // Save as Draft does NOT chain updateStatus.
      expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('calls /send (no chained status PATCH) on Save & Send', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      vi.mocked(apiClient.post).mockImplementation((url: string) => {
        if (url === '/financial/invoices') {
          return Promise.resolve({ data: { id: 'inv-new', status: 'DRAFT' } });
        }
        if (url === '/financial/invoices/inv-new/send') {
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
      renderTab();
      await user.click(await screen.findByRole('button', { name: /new invoice/i }));
      await user.type(
        screen.getByRole('textbox', { name: /description/i }),
        'Service call',
      );
      await user.type(screen.getByRole('textbox', { name: /amount/i }), '350');
      await user.click(screen.getByRole('button', { name: /save & send/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/invoices/inv-new/send',
          undefined,
        );
      });
      expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('validates description and amount before submitting', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /new invoice/i }));
      // Empty description.
      await user.click(screen.getByRole('button', { name: /save as draft/i }));
      expect(
        await screen.findByText(/Description is required/i),
      ).toBeInTheDocument();
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('auto-opens when openInvoiceCreateSignal is non-zero', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
      renderWithProviders(
        <FinancialInvoicesTab
          workOrderId="wo-1"
          workOrderNumber="WO-00010"
          customerId="cust-1"
          customerName="Tenant 2 Inc."
          openInvoiceCreateSignal={1}
        />,
      );
      // Dialog auto-opens via the signal — no button click needed.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Record Payment flow (Phase 7 §4.4)', () => {
    it('disables the tab-level + Record Payment when no invoice has outstanding balance', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [
          makeInvoice({
            balanceDue: '0.00' as unknown as number,
            amountPaid: '1500.00' as unknown as number,
          }),
        ],
      });
      renderTab();
      const cta = await screen.findByRole('button', { name: /record payment/i });
      expect(cta).toBeDisabled();
    });

    it('opens the dialog with the picker visible from the tab-level CTA', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      renderTab();
      const cta = await screen.findByRole('button', { name: /record payment/i });
      await user.click(cta);
      // Picker = a combobox / select labeled "Invoice"
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /invoice/i })).toBeInTheDocument();
    });

    it('opens the dialog locked to the row when + Payment is clicked inside the expansion', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      renderTab();
      await user.click(await screen.findByRole('button', { name: /show line items/i }));
      const addPayment = screen.getByRole('button', { name: /^payment$/i });
      await user.click(addPayment);
      // Picker is hidden when locked — no Invoice combobox in this mode.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(
        screen.queryByRole('combobox', { name: /invoice/i }),
      ).not.toBeInTheDocument();
      // The locked invoice number is displayed as read-only context
      // inside the dialog (in addition to the table row in the background).
      const dialog = screen.getByRole('dialog');
      expect(dialog.textContent).toMatch(/INV-0042/);
    });

    it('records a payment via the dialog', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [makeInvoice()] });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { id: 'pay-new' },
      });
      renderTab();
      const cta = await screen.findByRole('button', { name: /record payment/i });
      await user.click(cta);
      // Default amount auto-fills to the open balance ($1000.00). Submit.
      const submit = await screen.findByRole('button', { name: /^record payment$/i });
      await user.click(submit);
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/financial/payments',
          expect.objectContaining({
            // Bill-to customer pulled from the invoice (fixture: cust-1).
            customerId: 'cust-1',
            amount: 1000,
            paymentMethod: 'CHECK',
            applications: [
              { invoiceId: 'inv-1', amountApplied: 1000 },
            ],
          }),
        );
      });
    });
  });
});
