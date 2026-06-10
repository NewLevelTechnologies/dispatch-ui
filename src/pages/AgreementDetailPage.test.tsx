import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import AgreementDetailPage from './AgreementDetailPage';
import { agreementApi, customerApi, dispatchesApi } from '../api';

vi.mock('../api', () => ({
  agreementApi: {
    getById: vi.fn(),
    getCoverage: vi.fn(),
    getVisits: vi.fn(),
    getCompliance: vi.fn(),
    getBillingSchedule: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  },
  customerApi: { getServiceLocations: vi.fn() },
  dispatchesApi: { listForWorkOrder: vi.fn() },
}));

const agreement = {
  id: 'a-1',
  agreementNumber: 'SA-00042',
  tenantId: 't-1',
  customer: { id: 'c-1', name: 'Iverson Properties LLC' },
  name: 'Quarterly PM — Retail',
  kind: 'VISIT' as const,
  classification: 'CONTRACT' as const,
  status: 'ACTIVE' as const,
  termStart: '2024-09-01',
  termEnd: '2027-09-01',
  autoRenew: true,
  renewalTermMonths: 12,
  renewalAlertDays: 90,
  notes: 'Pricing assumes 78 locations.',
  coverageLocationCount: 78,
  visitTemplates: [
    {
      id: 'vt-1',
      agreementId: 'a-1',
      label: 'Quarterly PM',
      cadenceUnit: 'QUARTER' as const,
      cadenceInterval: 1,
      anchorDate: '2024-09-01',
      seasonOrdinal: null,
      windowDays: 30,
      estDurationMinutes: 90,
      scopeItems: [{ description: 'Replace filters', equipmentTypeId: null, season: null }],
      scopeVersion: 1,
      createdAt: '',
      updatedAt: '',
    },
  ],
  createdAt: '',
  updatedAt: '',
};

function renderPage() {
  return renderWithProviders(<AgreementDetailPage />, {
    routes: [{ path: '/agreements/:id', element: <AgreementDetailPage /> }],
    initialPath: '/agreements/a-1',
  });
}

describe('AgreementDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementApi.getById).mockResolvedValue(agreement);
    vi.mocked(agreementApi.getCoverage).mockResolvedValue({
      agreementId: 'a-1',
      selectorMode: 'TAG',
      selectorTagId: null,
      autoAdd: true,
      locationCount: 78,
      memberships: [],
    });
    vi.mocked(agreementApi.getVisits).mockResolvedValue([]);
    vi.mocked(customerApi.getServiceLocations).mockResolvedValue([]);
    vi.mocked(dispatchesApi.listForWorkOrder).mockResolvedValue([]);
    // Pending-merge endpoints — default to 404 (rejected).
    vi.mocked(agreementApi.getCompliance).mockRejectedValue(new Error('404'));
    vi.mocked(agreementApi.getBillingSchedule).mockRejectedValue(new Error('404'));
  });

  it('renders the header (name, number, customer) and the tab row', async () => {
    renderPage();
    expect(await screen.findByText('Quarterly PM — Retail')).toBeInTheDocument();
    expect(screen.getByText('SA-00042')).toBeInTheDocument();
    // Customer name appears in the header meta link and the right-rail Customer card.
    expect(screen.getAllByText('Iverson Properties LLC').length).toBeGreaterThan(0);
    // Tab labels
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /coverage/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /schedule/i })).toBeInTheDocument();
  });

  it('hides ARR and the compliance headline when billing + compliance 404', async () => {
    renderPage();
    await screen.findByText('Quarterly PM — Retail');
    // Let the rejected billing/compliance queries settle.
    await waitFor(() => expect(agreementApi.getBillingSchedule).toHaveBeenCalled());
    expect(screen.queryByText(/\/yr/)).not.toBeInTheDocument();
    expect(screen.queryByText(/This term/i)).not.toBeInTheDocument();
  });

  it('shows derived ARR and compliance when those endpoints resolve', async () => {
    vi.mocked(agreementApi.getBillingSchedule).mockResolvedValue({
      agreementId: 'a-1',
      amount: 27000,
      cadenceUnit: 'QUARTER',
      cadenceInterval: 1,
      anchorDate: '2024-09-01',
      netDays: 30,
      billingMode: 'FIXED_SCHEDULE',
      active: true,
    });
    vi.mocked(agreementApi.getCompliance).mockResolvedValue({
      agreementId: 'a-1',
      visitsFulfilled: 12,
      visitsTotal: 16,
      visitsOverdue: 2,
      visitsMissed: 0,
    });
    renderPage();
    // ARR = 27,000 × 4 quarters = $108,000 / yr — shown in both the header meta
    // and the Financials card, so expect at least one match.
    expect((await screen.findAllByText('$108,000')).length).toBeGreaterThan(0);
    expect(screen.getByText('This term')).toBeInTheDocument();
    expect(screen.getByText(/2 behind schedule/)).toBeInTheDocument();
  });
});
