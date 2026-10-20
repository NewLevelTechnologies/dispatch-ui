import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import PaymentsPage from './PaymentsPage';

const mockPayments = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    paymentsApi: { ...actual.paymentsApi, getAll: (...a: unknown[]) => mockPayments(...a) },
    invoicesApi: { ...actual.invoicesApi, getAll: () => Promise.resolve({ content: [], page: 0, size: 200, totalElements: 0, totalPages: 0, first: true, last: true }) },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]) },
    customerApi: { ...actual.customerApi, getAllPaginated: () => Promise.resolve({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 }) },
  };
});

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    customerId: 'c1',
    payerName: 'Acme Diner',
    paymentNumber: 'PAY-0001',
    status: 'RECEIVED',
    paymentDate: '2026-10-01',
    amount: 250,
    paymentMethod: 'CREDIT_CARD',
    referenceNumber: '4411',
    notes: null,
    applications: [
      { id: 'pa1', invoiceId: 'i1', invoiceNumber: 'INV-1001', amountApplied: 150 },
      { id: 'pa2', invoiceId: 'i2', invoiceNumber: 'INV-1002', amountApplied: 100 },
    ],
    unappliedAmount: 0,
    voidedAt: null,
    amountInScope: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const page = (content: unknown[], totalElements = content.length, totalPages = 1) => ({
  content,
  page: 0,
  size: 25,
  totalElements,
  totalPages,
  first: true,
  last: totalPages <= 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPayments.mockResolvedValue(page([payment(), payment({ id: 'p2', paymentNumber: 'PAY-0002', status: 'VOID', applications: [] })], 60, 3));
});

describe('PaymentsPage', () => {
  it('pages the server list and shows the payer and every invoice it paid', async () => {
    renderWithProviders(<PaymentsPage />, { initialPath: '/payments?page=2' });

    const row = (await screen.findByText('PAY-0001')).closest('tr')!;
    expect(mockPayments).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 25 }));
    expect(row).toHaveTextContent('Acme Diner');
    expect(row).toHaveTextContent('INV-1001, INV-1002');
    expect(row).toHaveTextContent('payments.methods.creditCard');
    expect(row).toHaveTextContent('Oct 1, 2026');
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(0);
  });

  it('strikes a voided payment and marks one applied to nothing', async () => {
    renderWithProviders(<PaymentsPage />, { initialPath: '/payments' });

    const row = (await screen.findByText('PAY-0002')).closest('tr')!;
    expect(within(row).getByText('payments.status.VOID')).toBeInTheDocument();
    expect(within(row).getByText('$250.00')).toHaveClass('line-through');
    expect(row).toHaveTextContent('payments.table.unapplied');
  });

  it('sends the URL filters to the server', async () => {
    renderWithProviders(<PaymentsPage />, { initialPath: '/payments?from=2026-10-01&to=2026-10-31&method=CHECK&status=RECEIVED' });

    await waitFor(() =>
      expect(mockPayments).toHaveBeenCalledWith({
        from: '2026-10-01',
        to: '2026-10-31',
        method: ['CHECK'],
        status: ['RECEIVED'],
        page: 0,
        size: 25,
      }),
    );
  });

  it('searches the server from the URL', async () => {
    renderWithProviders(<PaymentsPage />, { initialPath: '/payments?search=1042' });

    await waitFor(() => expect(mockPayments).toHaveBeenCalledWith(expect.objectContaining({ q: '1042', page: 0 })));
    expect(screen.getByRole('textbox')).toHaveValue('1042');
  });

  it('narrows to one payer in one region, showing the part paid there', async () => {
    mockPayments.mockResolvedValue(page([payment({ amountInScope: 150, receivedByName: 'Pat Office' })]));
    renderWithProviders(<PaymentsPage />, { initialPath: '/payments?payer=c1&region=r1' });

    const row = (await screen.findByText('PAY-0001')).closest('tr')!;
    expect(mockPayments).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1', regionIds: ['r1'] }));
    expect(row).toHaveTextContent('$150.00');
    expect(row).toHaveTextContent('payments.table.ofTotal');
    expect(row).toHaveTextContent('Pat Office');
    expect(screen.getByRole('button', { name: 'Acme Diner' })).toBeInTheDocument();
  });
});
