import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import PublicQuotePage from './PublicQuotePage';
import publicApiClient from '../api/publicClient';
import type { PublicQuoteResponse } from '../api/publicFinancialApi';

vi.mock('../api/publicClient', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

function buildResponse(
  overrides: Partial<PublicQuoteResponse['quote']> = {},
): PublicQuoteResponse {
  return {
    quote: {
      quoteNumber: 'Q-0007',
      status: 'SENT',
      quoteDate: '2026-05-10',
      expirationDate: '2026-06-09',
      subtotal: '1200.00',
      taxRate: '0.00',
      taxAmount: '0.00',
      totalAmount: '1200.00',
      notes: null,
      lineItems: [
        {
          description: 'Replace compressor',
          quantity: '1.00',
          unitPrice: '1200.00',
          lineTotal: '1200.00',
        },
      ],
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
    },
    customer: { id: 'cust-1', name: 'Jane Smith' },
  };
}

const renderAt = (token: string) =>
  renderWithProviders(<PublicQuotePage />, {
    routes: [
      { path: '/p/quote/:token', element: <PublicQuotePage /> },
      { path: '*', element: <PublicQuotePage /> },
    ],
    initialPath: `/p/quote/${token}`,
  });

describe('PublicQuotePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the quote with tenant branding and the total amount', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse(),
    });
    renderAt('tok-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Acme HVAC/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Q-0007/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$1,200\.00/).length).toBeGreaterThan(0);
  });

  it('shows a "Declined" badge for REJECTED quotes', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({ status: 'REJECTED' }),
    });
    renderAt('tok-1');
    expect(await screen.findByText(/declined/i)).toBeInTheDocument();
  });

  it('shows a "Cancelled" badge for CANCELLED quotes', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({ status: 'CANCELLED' }),
    });
    renderAt('tok-1');
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/Q-0007/)).toBeInTheDocument();
    expect(
      vi.mocked(publicApiClient.get).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('shows the cliff page when the token is missing from the URL', () => {
    renderWithProviders(<PublicQuotePage />, {
      routes: [{ path: '*', element: <PublicQuotePage /> }],
      initialPath: '/p/quote/',
    });
    expect(
      screen.getByRole('heading', { name: /this link is no longer available/i }),
    ).toBeInTheDocument();
  });
});
