/* eslint-disable i18next/no-literal-string -- assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ApprovalsPage from './ApprovalsPage';
import { apiClient, type QuotePriceApproval } from '../api/setup';
import { useHasAnyCapability } from '../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const priceRequest = (over: Partial<QuotePriceApproval> = {}): QuotePriceApproval => ({
  id: 'pa-1', quoteId: 'q-1', quoteNumber: 'Q-1907', quoteTitle: 'Replace AC', customerName: 'Tanya Reyes', revision: 1,
  status: 'PENDING', current: true, requestedByUserId: 'u-danny', requestedByName: 'Danny Ortiz',
  requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), reason: 'Matching a bid', sendsOnApproval: true,
  lowestMargin: 0.248, floor: 0.35, totalAmount: 15060, respondedByUserId: null, respondedByName: null, respondedAt: null,
  responseNote: null, ...over,
});

let prices: QuotePriceApproval[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('APPROVE_QUOTES'));
  prices = [priceRequest()];
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/users/me') return Promise.resolve({ data: { id: 'me-1', firstName: 'Sam', lastName: 'Manager', capabilities: ['APPROVE_QUOTES'] } });
    // OPEN workflow mode with no history: only price approvals keep the page.
    if (url === '/work-orders/config/workflow') return Promise.resolve({ data: { enforcementMode: 'OPEN', hasAnyApprovalRequests: false } });
    if (url.startsWith('/work-orders/approvals/count')) return Promise.resolve({ data: { pendingForMe: 0, recentlyResolvedMine: 0 } });
    if (url.startsWith('/work-orders/approvals')) return Promise.resolve({ data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 } });
    if (url === '/financial/quote-price-approvals/count') return Promise.resolve({ data: { pending: prices.length } });
    if (url === '/financial/quote-price-approvals') return Promise.resolve({ data: prices });
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });
  vi.mocked(apiClient.post).mockImplementation(() => Promise.resolve({ data: { ...priceRequest(), status: 'APPROVED' } }));
});

describe('ApprovalsPage · quote prices', () => {
  it('lists a below-floor price in the manager’s pending queue and approves it with a note', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsPage />);

    const [row] = await screen.findAllByTestId('price-approval-row');
    expect(row).toHaveTextContent('Danny Ortiz');
    expect(row).toHaveTextContent('Q-1907');
    const detail = await screen.findByTestId('price-approval-detail');
    expect(detail).toHaveTextContent('Matching a bid');
    expect(detail).toHaveTextContent('$15,060.00');

    await user.type(within(detail).getByRole('textbox'), 'OK this once');
    await user.click(within(detail).getByRole('button', { name: /^(Approve|approvals.action.approve)$/ }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/financial/quote-price-approvals/pa-1/approve', { note: 'OK this once' }));
  });

  it('won’t approve a price whose quote changed since it was asked', async () => {
    prices = [priceRequest({ current: false })];
    renderWithProviders(<ApprovalsPage />);

    const detail = await screen.findByTestId('price-approval-detail');
    expect(detail).toHaveTextContent('approvals.price.changedBody');
    expect(within(detail).queryByRole('button', { name: /^(Approve|approvals.action.approve)$/ })).not.toBeInTheDocument();
  });
});
