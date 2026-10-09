import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import QuotesPage from './QuotesPage';

const mockQuotes = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    quotesApi: { ...actual.quotesApi, getAll: (...a: unknown[]) => mockQuotes(...a) },
    customerApi: {
      ...actual.customerApi,
      getAllPaginated: () => Promise.resolve({ content: [{ id: 'c1', name: 'Acme Diner' }], totalElements: 1, totalPages: 1, number: 0, size: 200 }),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQuotes.mockResolvedValue({
    content: [
      {
        id: 'q1',
        customerId: 'c1',
        quoteNumber: 'Q-0042',
        status: 'SENT',
        quoteDate: '2026-10-01',
        expirationDate: '2026-10-31',
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 100,
        lineItems: [],
        createdAt: '',
        updatedAt: '',
      },
    ],
    page: 0,
    size: 25,
    totalElements: 31,
    totalPages: 2,
    first: true,
    last: false,
  });
});

describe('QuotesPage', () => {
  it('pages the server list', async () => {
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes' });

    const row = (await screen.findByText('Q-0042')).closest('tr')!;
    expect(mockQuotes).toHaveBeenCalledWith(expect.objectContaining({ page: 0, size: 25 }));
    await waitFor(() => expect(row).toHaveTextContent('Acme Diner'));
    expect(screen.getAllByText(/31/).length).toBeGreaterThan(0);
  });

  it('sends the sent range and status to the server', async () => {
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes?sentFrom=2026-10-01&sentTo=2026-10-09&status=ACCEPTED&page=2' });

    await waitFor(() =>
      expect(mockQuotes).toHaveBeenCalledWith({
        firstSentFrom: '2026-10-01',
        firstSentTo: '2026-10-09',
        status: ['ACCEPTED'],
        page: 1,
        size: 25,
      }),
    );
  });

  it('narrows to one sender in one region, from the Quotes report', async () => {
    renderWithProviders(<QuotesPage />, { initialPath: '/quotes?sentFrom=2026-09-01&sentTo=2026-09-30&region=r1&sender=u1' });

    await waitFor(() =>
      expect(mockQuotes).toHaveBeenCalledWith(
        expect.objectContaining({ sentByUserId: 'u1', regionIds: ['r1'], firstSentFrom: '2026-09-01' }),
      ),
    );
  });
});
