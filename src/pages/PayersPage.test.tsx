import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PayersPage from './PayersPage';
import apiClient from '../api/client';
import type { CustomerListDto, CustomerListResponse } from '../api';

vi.mock('../api/client');

const payerRow = (over: Partial<CustomerListDto> = {}): CustomerListDto => ({
  id: 'p1',
  customerNumber: 'P-2010',
  name: 'American Home Shield',
  email: 'ar@ahs.com',
  type: 'BILLING_ONLY',
  billingAddress: { streetAddress: '1 A St', city: 'Phoenix', state: 'AZ', zipCode: '85007' },
  serviceLocationCount: 0,
  paymentTermsDays: 60,
  requiresPurchaseOrder: false,
  status: 'ACTIVE',
  openBalanceTotal: 14200,
  aged91Total: 2400,
  openInvoiceCount: 22,
  lifetimePaid: 284600,
  lastPaymentAt: '2026-06-14T15:00:00Z',
  lastPaymentAmount: 1420,
  currency: 'USD',
  ...over,
});

const pageResp = (content: CustomerListDto[]): Partial<CustomerListResponse> => ({
  content,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  number: 0,
  counts: { total: content.length, active: content.length },
});

describe('PayersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders payer rows with financial figures off /customers/payers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageResp([payerRow()]) });
    renderWithProviders(<PayersPage />);

    expect(await screen.findByText('American Home Shield')).toBeInTheDocument();
    expect(screen.getByText('$14,200')).toBeInTheDocument(); // outstanding
    expect(screen.getByText('$2,400 in 91+')).toBeInTheDocument(); // aged sub
    expect(screen.getByText('$285k')).toBeInTheDocument(); // lifetime, compact
    expect(apiClient.get).toHaveBeenCalledWith(
      '/customers/payers',
      expect.objectContaining({ params: expect.objectContaining({ page: 0 }) }),
    );
  });

  it('re-queries with a server sort param when a column header is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageResp([payerRow()]) });
    renderWithProviders(<PayersPage />);
    await screen.findByText('American Home Shield');

    await userEvent.click(screen.getByRole('button', { name: /lifetime paid/i }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/customers/payers',
        expect.objectContaining({ params: expect.objectContaining({ sort: 'lifetimePaid,desc' }) }),
      ),
    );
  });

  it('shows the empty state when there are no payers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageResp([]) });
    renderWithProviders(<PayersPage />);

    // Title renders (glossary plural) and no payer row appears.
    expect(await screen.findByText('Payers')).toBeInTheDocument();
    expect(screen.queryByText('American Home Shield')).not.toBeInTheDocument();
  });
});
