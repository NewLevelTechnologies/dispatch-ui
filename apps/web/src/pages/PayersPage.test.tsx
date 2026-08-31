import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PayersPage from './PayersPage';
import { apiClient } from '../api/setup';
import type { CustomerListDto, CustomerListResponse } from '../api/setup';

vi.mock('@dispatch/api/src/client');

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

  it('re-queries with ?openBalance when the open-balance chip is toggled', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pageResp([payerRow()]), counts: { total: 1, openBalance: 7, aged: 3 } },
    });
    renderWithProviders(<PayersPage />);
    await screen.findByText('American Home Shield');

    // Badge counts come off the response envelope (counts.openBalance / counts.aged).
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open balance/i }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/customers/payers',
        expect.objectContaining({ params: expect.objectContaining({ openBalance: true }) }),
      ),
    );
  });

  it('renders row tags and re-queries with ?tags when a tag is picked', async () => {
    const tag = { id: 'tag-warranty', name: 'Warranty', color: 'INFO' };
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/customers/tags') return Promise.resolve({ data: [tag] });
      return Promise.resolve({ data: pageResp([payerRow({ tags: [tag] })]) });
    });
    renderWithProviders(<PayersPage />);
    await screen.findByText('American Home Shield');

    // Tags are the payer "subtype" — chip renders in the row subline.
    expect(screen.getAllByText('Warranty').length).toBeGreaterThan(0);

    // Open the Tags filter and select the tag → server-side ?tags filter.
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }));
    await userEvent.click(await screen.findByRole('option', { name: /warranty/i }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/customers/payers',
        expect.objectContaining({ params: expect.objectContaining({ tags: 'tag-warranty' }) }),
      ),
    );
  });

  it('shows the empty state when there are no payers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageResp([]) });
    renderWithProviders(<PayersPage />);

    // Title renders (glossary plural) and no payer row appears. Target the
    // heading specifically — "Payers" also appears in the Customers/Payers toggle.
    expect(await screen.findByRole('heading', { name: 'Payers' })).toBeInTheDocument();
    expect(screen.queryByText('American Home Shield')).not.toBeInTheDocument();
  });
});
