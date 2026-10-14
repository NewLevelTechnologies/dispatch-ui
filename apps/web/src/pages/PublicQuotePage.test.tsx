import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PublicQuotePage from './PublicQuotePage';
import publicApiClient from '@dispatch/api/src/publicClient';
import type { PublicQuoteResponse } from '../api/setup';

vi.mock('@dispatch/api/src/publicClient', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
  setPublicApiBaseURL: vi.fn(),
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

  it('shows the office preview of a draft as it will be sent, with nothing to approve', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: { ...buildResponse({ status: 'DRAFT' }), preview: true },
    });
    renderAt('tok-preview');
    expect(await screen.findByText('Preview')).toBeInTheDocument();
    expect(screen.getByText(/This is what Jane Smith will see/)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument(); // not "Draft"
    expect(screen.getByText('Replace compressor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve quote' })).not.toBeInTheDocument();
  });

  it('has no preview banner on a real link', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: { ...buildResponse(), preview: false } });
    renderAt('tok-1');
    expect(await screen.findByRole('button', { name: 'Approve quote' })).toBeInTheDocument();
    expect(screen.queryByText(/This is what Jane Smith will see/)).not.toBeInTheDocument();
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

  it('says the quote is being updated, with no amounts, while the office revises it', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({
        beingUpdated: true,
        revision: 3,
        subtotal: null,
        taxAmount: null,
        totalAmount: null,
        lineItems: [],
      } as never),
    });
    renderAt('tok-1');
    expect(await screen.findByText('This quote is being updated')).toBeInTheDocument();
    expect(screen.getByText(/Acme HVAC is making changes/)).toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
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

  it('shows savings: the list price struck through, why, and what the customer saves', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: buildResponse({
        grossSubtotal: '1289.00',
        adjustmentTotal: '139.00',
        subtotal: '1150.00',
        totalAmount: '1150.00',
        taxJurisdictionName: 'Phoenix, AZ',
        taxExempt: true,
        documentAdjustments: [{ kind: 'AMOUNT', reasonCode: 'GOODWILL', value: '50.00', amount: '50.00' }],
        lineItems: [
          {
            description: 'Trip charge',
            quantity: '1',
            unitPrice: '89.00',
            lineTotal: '89.00',
            adjustmentAmount: '89.00',
            netAmount: '0.00',
            adjustments: [{ kind: 'WAIVE', reasonCode: 'MEMBER', value: null, amount: '89.00' }],
          },
          { description: 'Replace compressor', quantity: '1', unitPrice: '1200.00', lineTotal: '1200.00', adjustmentAmount: '50.00', netAmount: '1150.00', adjustments: [] },
        ],
      }),
    });
    renderAt('tok-s');

    expect(await screen.findByText('Waived · Member')).toBeInTheDocument();
    expect(screen.getByText('$89.00')).toHaveClass('line-through');
    expect(screen.getByText('$1,289.00')).toBeInTheDocument();
    expect(screen.getByText('−$139.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00 off · Courtesy · −$50.00')).toBeInTheDocument();
    expect(screen.getByText('Tax (exempt)')).toBeInTheDocument();
  });

  it('approves the revision shown, after confirming', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: buildResponse({ revision: 3 }) });
    vi.mocked(publicApiClient.post).mockResolvedValueOnce({
      data: buildResponse({ revision: 3, status: 'ACCEPTED', decidedAt: '2026-10-13T16:00:00Z', approvedByName: 'Karen Wu' }),
    });
    renderAt('tok-a');

    await user.click(await screen.findByRole('button', { name: 'Approve quote' }));
    expect(screen.getByText('Approve quote #Q-0007 for $1,200.00?')).toBeInTheDocument();
    // Signing needs the customer's name and the confirmation both.
    const confirm = screen.getByRole('button', { name: 'Yes, approve' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), '  Karen Wu ');
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I approve quote #Q-0007 for $1,200.00.' }));
    await user.click(confirm);

    expect(publicApiClient.post).toHaveBeenCalledWith(
      '/public/quotes/approve',
      { revision: 3, approverName: 'Karen Wu' },
      expect.objectContaining({ headers: { 'X-Share-Token': 'tok-a' } }),
    );
    expect(await screen.findByText(/^Approved .* by Karen Wu$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve quote' })).not.toBeInTheDocument();
  });

  it('reloads and says so when the quote was revised since it opened', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApiClient.get)
      .mockResolvedValueOnce({ data: buildResponse({ revision: 1 }) })
      .mockResolvedValue({ data: buildResponse({ revision: 2, totalAmount: '1300.00' }) });
    vi.mocked(publicApiClient.post).mockRejectedValueOnce(
      Object.assign(new Error('409'), { isAxiosError: true, response: { status: 409, data: { code: 'QUOTE_REVISION_STALE' } } }),
    );
    renderAt('tok-r');

    await user.click(await screen.findByRole('button', { name: 'Approve quote' }));
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Karen Wu');
    await user.click(screen.getByRole('checkbox', { name: /I approve quote/ }));
    await user.click(screen.getByRole('button', { name: 'Yes, approve' }));

    expect(await screen.findByText('This quote was just updated. Review the new version before approving.')).toBeInTheDocument();
    await waitFor(() => expect(publicApiClient.get).toHaveBeenCalledTimes(2));
  });

  it('says when a declined quote was declined, with no approve button', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: buildResponse({ status: 'DECLINED', decidedAt: '2026-10-05T16:00:00Z' }) });
    renderAt('tok-d');
    expect(await screen.findByText(/^Declined .*2026$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve quote' })).not.toBeInTheDocument();
  });

  it('tells the customer an expired quote needs updating, and can’t be approved', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: buildResponse({ status: 'EXPIRED' }) });
    renderAt('tok-x');
    expect(await screen.findByText(/^This quote expired .* for an updated quote\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve quote' })).not.toBeInTheDocument();
  });

  it('shows the quote’s title under its number', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: buildResponse({ title: 'Condenser replacement · 3-ton' }) });
    renderAt('tok-t');
    expect(await screen.findByText('Condenser replacement · 3-ton')).toBeInTheDocument();
  });

  it('presents a pricebook item with its photos, customer name, description and highlights', async () => {
    const base = buildResponse({});
    const line = {
      ...base.quote.lineItems[0],
      description: 'Capacitor 45/5',
      presentation: {
        customerName: 'Run capacitor replacement',
        description: 'Restores the motor’s starting power.',
        highlights: ['Same-day', '1-year warranty'],
        photos: [{ url: 'https://cdn/c.jpg', thumbnailUrl: 'https://cdn/c-t.jpg' }],
      },
    };
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: { ...base, quote: { ...base.quote, lineItems: [line] } } });
    renderAt('tok-p');

    expect(await screen.findByText('Run capacitor replacement')).toBeInTheDocument();
    expect(screen.queryByText('Capacitor 45/5')).not.toBeInTheDocument();
    expect(screen.getByText('Restores the motor’s starting power.')).toBeInTheDocument();
    expect(screen.getByText('1-year warranty')).toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn/c-t.jpg"]')).not.toBeNull();
  });
});
