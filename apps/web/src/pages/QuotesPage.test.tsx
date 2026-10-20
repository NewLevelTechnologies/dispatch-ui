import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import QuotesPage from './QuotesPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'q-1', quoteNumber: 'Q-2051', title: 'RTU-2 repair · T&M', status: 'ACCEPTED', customerId: 'c-1',
  customerName: 'Desert Ridge Property Mgmt', billToIsPayer: true, workOrderId: 'wo-1', workOrderNumber: 'WO-4107',
  serviceLocationName: 'Camelback Plaza · Suite 210', quoteDate: '2026-10-03', expirationDate: '2026-11-02',
  subtotal: 3962.18, taxAmount: 0, totalAmount: 3962.18, lineCount: 9, revision: 2, createdByName: 'Luis Romero',
  firstSentAt: '2026-10-03T15:00:00Z', firstSentByUserId: 'u-9', firstSentByName: 'Luis Romero', decidedAt: '2026-10-10T15:00:00Z',
  invoicedPercent: 75, remainingToInvoice: 990.55, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', ...over,
});
const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, page: 0, size: 25, first: true, last: true });
const views = {
  counts: { open: 5, readyToInvoice: 3, accepted: 4, closed: 2, all: 12 },
  awaitingCustomer: 25280,
  expiringThisWeek: 1,
  readyToInvoiceAmount: 8553,
};
const listParams = () =>
  vi
    .mocked(apiClient.get)
    .mock.calls.filter(([u]) => u === '/financial/quotes')
    .map(([, cfg]) => (cfg as { params: Record<string, unknown> }).params);

describe('QuotesPage', () => {
  let rows: unknown[];
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [row()];
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/quotes') return Promise.resolve({ data: page(rows) });
      if (url === '/financial/quotes/views') return Promise.resolve({ data: views });
      if (url === '/financial/quotes/q-1/invoiceable') return Promise.resolve({ data: { quoteId: 'q-1', lines: [] } });
      if (url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [{ id: 'r1', name: 'West Valley' }] });
      return Promise.resolve({ data: [] });
    });
  });

  it('opens on Open quotes, with tab counts and the summary', async () => {
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes' });

    expect(await screen.findByText('Q-2051')).toBeInTheDocument();
    expect(listParams()[0]).toMatchObject({ status: 'DRAFT,SENT' });
    expect(await screen.findByText('$25,280')).toBeInTheDocument();
    expect(screen.getByText('$8,553')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Ready to invoice/ })).toHaveTextContent('3');
  });

  it('shows the title, advisor, revision and how much is invoiced', async () => {
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes?view=accepted' });

    const tr = (await screen.findByText('Q-2051')).closest('tr')!;
    expect(tr).toHaveTextContent('Rev 2');
    expect(tr).toHaveTextContent('WO-4107');
    expect(tr).toHaveTextContent('Payer');
    expect(tr).toHaveTextContent('RTU-2 repair · T&M');
    expect(tr).toHaveTextContent('9 lines');
    expect(tr).toHaveTextContent('Luis Romero');
    expect(tr).toHaveTextContent('75% invoiced · $991 left');
  });

  it('flags a sent quote being revised', async () => {
    rows = [row({ status: 'DRAFT', revision: 3, invoicedPercent: null, decidedAt: null })];
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes' });

    const tr = (await screen.findByText('Q-2051')).closest('tr')!;
    expect(tr).toHaveTextContent('Being updated');
    expect(tr).toHaveTextContent('Rev 3 draft · link paused');
  });

  it('offers to invoice from the Ready to invoice tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes?view=ready' });

    await screen.findByText('Q-2051');
    expect(listParams()[0]).toMatchObject({ readyToInvoice: true });
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('keeps a Quotes report drill-in exact: one sender’s declined quotes in a region and range', async () => {
    renderWithProviders(<QuotesPage />, {
      initialPath: '/quotes?sentFrom=2026-09-01&sentTo=2026-09-30&status=DECLINED&sender=u-9&region=r1',
    });

    await screen.findByText('Q-2051');
    expect(listParams()).toContainEqual(
      expect.objectContaining({
        status: 'DECLINED', firstSentFrom: '2026-09-01', firstSentTo: '2026-09-30', sentByUserId: 'u-9', regionIds: ['r1'],
      }),
    );
    expect(await screen.findByRole('button', { name: /Sent by Luis Romero/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /West Valley/ })).toBeInTheDocument();
  });
});
