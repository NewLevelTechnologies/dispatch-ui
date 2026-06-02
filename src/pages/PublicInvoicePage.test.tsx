import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import PublicInvoicePage from './PublicInvoicePage';
import publicApiClient from '../api/publicClient';
import type { PublicInvoiceResponse } from '../api/publicFinancialApi';

vi.mock('../api/publicClient', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

function buildResponse(
  overrides: Partial<PublicInvoiceResponse['invoice']> = {},
  tenantOverrides: Partial<PublicInvoiceResponse['tenant']> = {},
): PublicInvoiceResponse {
  return {
    invoice: {
      invoiceNumber: 'INV-0042',
      status: 'SENT',
      invoiceDate: '2026-05-10',
      dueDate: '2026-06-09',
      subtotal: '500.00',
      taxRate: '0.00',
      taxAmount: '0.00',
      totalAmount: '500.00',
      amountPaid: '0.00',
      balanceDue: '500.00',
      notes: null,
      lineItems: [
        {
          description: 'HVAC tune-up',
          quantity: '1.00',
          unitPrice: '500.00',
          lineTotal: '500.00',
        },
      ],
      payments: [],
      ...overrides,
    },
    tenant: {
      displayName: 'Acme HVAC',
      companySlogan: null,
      logoUrl: null,
      streetAddress: '123 Main',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      supportEmail: 'support@acmehvac.example',
      supportPhone: '(555) 123-4567',
      ...tenantOverrides,
    },
    customer: { id: 'cust-1', name: 'Jane Smith' },
  };
}

const renderAt = (token: string) =>
  renderWithProviders(<PublicInvoicePage />, {
    routes: [
      { path: '/p/invoice/:token', element: <PublicInvoicePage /> },
      { path: '*', element: <PublicInvoicePage /> },
    ],
    initialPath: `/p/invoice/${token}`,
  });

describe('PublicInvoicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the invoice with tenant branding and the amount due hero', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse(),
    });
    renderAt('tok-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Acme HVAC/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/INV-0042/)).toBeInTheDocument();
    // Amount appears in the hero + the totals breakdown — assert at least
    // one renders (anti-flake against the multiple-match query).
    expect(screen.getAllByText(/\$500\.00/).length).toBeGreaterThan(0);
  });

  it('renders the voided banner when the invoice status is VOID', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({ status: 'VOID' }),
    });
    renderAt('tok-1');
    expect(
      await screen.findByText(/this invoice has been voided/i),
    ).toBeInTheDocument();
  });

  it('shows the cliff page when the token is missing from the URL', () => {
    renderWithProviders(<PublicInvoicePage />, {
      routes: [{ path: '*', element: <PublicInvoicePage /> }],
      initialPath: '/p/invoice/',
    });
    expect(
      screen.getByRole('heading', { name: /this link is no longer available/i }),
    ).toBeInTheDocument();
  });

  it('shows the cliff page when the token endpoint returns 404', async () => {
    vi.mocked(publicApiClient.get).mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404, data: {} },
      }),
    );
    renderAt('tok-bad');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /this link is no longer available/i }),
      ).toBeInTheDocument();
    });
  });

  it('hides the logo gracefully when tenant has no logo URL', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({}, { logoUrl: null }),
    });
    renderAt('tok-1');
    await screen.findByRole('heading', { level: 1, name: /Acme HVAC/ });
    expect(screen.queryByRole('img', { name: /acme hvac logo/i })).toBeNull();
  });

  it('renders cleanly when the tenant has no branding at all', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse(
        {},
        {
          displayName: null,
          companySlogan: null,
          logoUrl: null,
          streetAddress: null,
          city: null,
          state: null,
          zipCode: null,
          supportEmail: null,
          supportPhone: null,
        },
      ),
    });
    renderAt('tok-1');
    // Document body still renders.
    expect(await screen.findByText(/INV-0042/)).toBeInTheDocument();
    // No empty sender heading.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    // No contact footer.
    expect(screen.queryByText(/questions about this invoice/i)).toBeNull();
  });

  it('shows a "Partially paid" badge and a paid line in the totals when partially paid', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({
        status: 'PARTIALLY_PAID',
        amountPaid: '200.00',
        balanceDue: '300.00',
        payments: [
          {
            paymentDate: '2026-05-20',
            amount: '200.00',
            method: 'CREDIT_CARD',
            status: 'RECEIVED',
          },
        ],
      }),
    });
    renderAt('tok-1');
    expect(
      await screen.findByText(/partially paid/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/credit card/i)).toBeInTheDocument();
    // "Paid −$200.00" row in totals.
    expect(screen.getByText(/−\$200\.00/)).toBeInTheDocument();
  });

  it('revalidates and renders when the page is shown after a no-data initial load', async () => {
    // Mail's in-app browser prewarms the page; the initial request's result
    // never reaches the live page, leaving it stuck with no data. The
    // revalidation effect re-issues the request when the page is shown — the
    // same recovery the manual "Try again" gives. We model the failed initial
    // load as a 404 precisely because the page deliberately does NOT auto-retry
    // 404s, so a successful render here can only come from that revalidation,
    // making this a tight guard against the effect being removed.
    vi.mocked(publicApiClient.get)
      .mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), {
          isAxiosError: true,
          response: { status: 404, data: {} },
        }),
      )
      .mockResolvedValue({ data: buildResponse() });

    renderAt('tok-1');

    // Mail adopts the prewarmed page into the visible tab.
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(await screen.findByText(/INV-0042/)).toBeInTheDocument();
    expect(
      vi.mocked(publicApiClient.get).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('shows a Voided pill next to voided payment rows', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({
        amountPaid: '0.00',
        balanceDue: '500.00',
        payments: [
          {
            paymentDate: '2026-05-05',
            amount: '500.00',
            method: 'CASH',
            status: 'VOID',
          },
        ],
      }),
    });
    renderAt('tok-1');
    expect(await screen.findByText(/voided/i)).toBeInTheDocument();
    expect(screen.getByText(/cash/i)).toBeInTheDocument();
  });
});
