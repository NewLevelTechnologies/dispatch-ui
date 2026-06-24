import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, userEvent } from '../test/utils';
import { renderWithProviders } from '../test/utils';
import CustomerAgreementsTab from './CustomerAgreementsTab';
import { agreementApi } from '../api';

vi.mock('../api', () => ({
  agreementApi: { list: vi.fn(), create: vi.fn() },
  // The create form fetches active plans (paginated) for its sell-from-plan picker.
  agreementPlanApi: {
    getAll: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 }),
  },
}));

const agreements = [
  {
    id: 'a-1',
    agreementNumber: 'SA-00042',
    customer: { id: 'c-1', name: 'Iverson Properties LLC' },
    name: 'Quarterly PM — Retail',
    kind: 'VISIT' as const,
    classification: 'CONTRACT' as const,
    status: 'ACTIVE' as const,
    termStart: '2024-09-01',
    termEnd: '2027-09-01',
    autoRenew: true,
    createdAt: '',
    updatedAt: '',
  },
];

describe('CustomerAgreementsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the customer agreements and navigates on row click', async () => {
    vi.mocked(agreementApi.list).mockResolvedValue(agreements);
    const { router } = renderWithProviders(<CustomerAgreementsTab customerId="c-1" />);

    expect(await screen.findByText('Quarterly PM — Retail')).toBeInTheDocument();
    expect(screen.getByText('SA-00042')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(agreementApi.list).toHaveBeenCalledWith({ customerId: 'c-1' });

    await userEvent.click(screen.getByText('Quarterly PM — Retail'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agreements/a-1'));
    expect(router.state.location.search).toBe('?from=customer');
  });

  it('renders an empty state when there are no agreements', async () => {
    vi.mocked(agreementApi.list).mockResolvedValue([]);
    renderWithProviders(<CustomerAgreementsTab customerId="c-1" />);

    await waitFor(() => expect(agreementApi.list).toHaveBeenCalled());
    expect(screen.queryByText('SA-00042')).not.toBeInTheDocument();
  });

  it('creates a draft from the Add dialog and routes to it', async () => {
    vi.mocked(agreementApi.list).mockResolvedValue([]);
    vi.mocked(agreementApi.create).mockResolvedValue({
      ...agreements[0],
      id: 'a-new',
      status: 'DRAFT',
      tenantId: 't-1',
      coverageLocationCount: 0,
      visitTemplates: [],
    });
    const { router } = renderWithProviders(<CustomerAgreementsTab customerId="c-1" />);

    await waitFor(() => expect(agreementApi.list).toHaveBeenCalled());
    // Open the Add dialog (header button) and fill the required name.
    await userEvent.click(screen.getAllByRole('button', { name: /add agreement/i })[0]);
    const nameInput = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, 'New PM agreement');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(agreementApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'c-1', name: 'New PM agreement', kind: 'VISIT', classification: 'CONTRACT' }),
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/agreements/a-new'));
  });
});
