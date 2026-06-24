import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import AgreementDetailPage from './AgreementDetailPage';
import { agreementApi, agreementPlanApi, customerApi, dispatchesApi, invoicesApi, agreementFilesApi, agreementNotesApi, tenantSettingsApi, type TenantSettings, type AgreementPlanResponse } from '../api';

vi.mock('../api', () => ({
  agreementApi: {
    getById: vi.fn(),
    getCoverage: vi.fn(),
    getVisits: vi.fn(),
    getCompliance: vi.fn(),
    getBillingSchedule: vi.fn(),
    getInstallments: vi.fn(),
    getRevenueRecognition: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  },
  agreementPlanApi: { getById: vi.fn(), getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  customerApi: { getServiceLocations: vi.fn() },
  dispatchesApi: { listForWorkOrder: vi.fn() },
  invoicesApi: { getAll: vi.fn() },
  agreementFilesApi: { list: vi.fn(), upload: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  agreementNotesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  // Recognition block is gated on this tenant flag — the page reads getSettings.
  tenantSettingsApi: { getSettings: vi.fn() },
  // Const enum object — the billing/invoice surfaces build status→tone maps off it.
  InvoiceStatus: {
    DRAFT: 'DRAFT',
    SENT: 'SENT',
    PAID: 'PAID',
    OVERDUE: 'OVERDUE',
    CANCELLED: 'CANCELLED',
    VOID: 'VOID',
  },
  // Module-level constants the agreement file dialog/tab read at import time.
  FILE_CONTENT_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  OFFICE_DOC_CONTENT_TYPES: [
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  FILE_MAX_BYTES: 25 * 1024 * 1024,
  FILE_CAPTION_MAX_CHARS: 200,
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
    // Revenue recognition defaults to no billing (rejected → row hidden).
    vi.mocked(agreementApi.getRevenueRecognition).mockRejectedValue(new Error('404'));
    // Billing installments + invoices default to empty (no schedule).
    vi.mocked(agreementApi.getInstallments).mockResolvedValue([]);
    vi.mocked(invoicesApi.getAll).mockResolvedValue({
      content: [],
      page: 0,
      size: 25,
      totalElements: 0,
      totalPages: 0,
      first: true,
      last: true,
    });
    // Documents tab + badge default to empty.
    vi.mocked(agreementFilesApi.list).mockResolvedValue({
      content: [],
      number: 0,
      size: 100,
      totalElements: 0,
      totalPages: 0,
      first: true,
      last: true,
      counts: { all: 0, photos: 0, videos: 0, documents: 0 },
    });
    // Notes card → empty by default.
    vi.mocked(agreementNotesApi.list).mockResolvedValue([]);
    // Recognition gate OFF by default — the common (cash-basis) case, so the
    // block stays hidden unless a test opts the tenant in.
    vi.mocked(tenantSettingsApi.getSettings).mockResolvedValue({
      revenueRecognitionEnabled: false,
      revenueRecognitionBasis: 'STRAIGHT_LINE',
    } as unknown as TenantSettings);
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
      // visitsTotal (generated-so-far) is NOT the denominator; the header uses
      // visitsExpectedThisTerm (the term total). Make them differ to prove it.
      visitsTotal: 99,
      visitsExpectedThisTerm: 16,
      visitsOverdue: 2,
      visitsMissed: 0,
    });
    renderPage();
    // ARR = 27,000 × 4 quarters = $108,000 / yr — shown in both the header meta
    // and the Financials card, so expect at least one match.
    expect((await screen.findAllByText('$108,000')).length).toBeGreaterThan(0);
    expect(screen.getByText('This term')).toBeInTheDocument();
    expect(screen.getByText(/2 behind schedule/)).toBeInTheDocument();
    // Denominator = visitsExpectedThisTerm (16), not visitsTotal (99).
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('renders "This term" without a denominator for an open-ended agreement', async () => {
    vi.mocked(agreementApi.getCompliance).mockResolvedValue({
      agreementId: 'a-1',
      visitsFulfilled: 3,
      visitsTotal: 3,
      visitsExpectedThisTerm: null, // open-ended → no bounded term
      visitsOverdue: 0,
      visitsMissed: 0,
    });
    renderPage();
    await screen.findByText('This term');
    // Sub is "work orders complete" with no "· %" suffix (no term denominator).
    expect(screen.getByText('work orders complete')).toBeInTheDocument();
  });

  it('renders the configured billing surfaces (installment schedule + next invoice)', async () => {
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
    // 8 installments (> the 6-row cap) so the "Show all" toggle renders.
    vi.mocked(agreementApi.getInstallments).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        sequence: i + 1,
        periodKey: `2026-P${i + 1}`,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        dueDate: `2026-0${(i % 9) + 1}-15`,
        amount: 27000,
        status: i === 0 ? ('INVOICED' as const) : ('SCHEDULED' as const),
      })),
    );
    vi.mocked(invoicesApi.getAll).mockResolvedValue({
      content: [
        {
          id: 'inv-1', invoiceNumber: 'INV-9001', status: 'PAID', customerId: 'c-1', customerName: 'Iverson',
          serviceLocationId: null, workOrderId: null, agreementId: 'a-1', billingPeriodKey: '2026-P1',
          invoiceDate: '2026-09-01', dueDate: '2026-09-30', totalAmount: 27000, amountPaid: 27000,
          balanceDue: 0, overdue: false, lastSentAt: null, createdAt: '', updatedAt: '',
        },
      ],
      page: 0, size: 200, totalElements: 1, totalPages: 1, first: true, last: true,
    });
    // Recognition gate ON + per-visit basis → the block renders, anchored to
    // the work-order count.
    vi.mocked(tenantSettingsApi.getSettings).mockResolvedValue({
      revenueRecognitionEnabled: true,
      revenueRecognitionBasis: 'PER_VISIT',
    } as unknown as TenantSettings);
    vi.mocked(agreementApi.getRevenueRecognition).mockResolvedValue({
      basis: 'PER_VISIT',
      contractValue: 108000,
      recognizedToDate: 27000,
      deferred: 81000,
      visitsFulfilled: 1,
      visitsExpectedThisTerm: 4,
    });
    renderPage();

    expect(await screen.findByText('Installment schedule')).toBeInTheDocument();
    // P1 invoice is paid → Paid dot; P2 is the earliest scheduled → Next dot.
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    // Next-invoice metric appears in both the header strip and the money summary.
    expect(screen.getAllByText('Next invoice').length).toBeGreaterThan(0);
    // Revenue-recognition block (contractValue non-null) renders.
    expect(screen.getByText('Recognized to date')).toBeInTheDocument();
    expect(screen.getByText('Deferred')).toBeInTheDocument();
    expect(screen.getByText('$81,000')).toBeInTheDocument();
    // Per-visit basis → anchor shows the work-order completion count.
    expect(screen.getByText('1 of 4 work orders complete')).toBeInTheDocument();
    // Schedule is capped at 6 rows; expanding reveals the rest.
    await userEvent.setup().click(screen.getByText('Show all 8'));
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it('hides recognized/deferred when no billing (contractValue null)', async () => {
    // Gate ON so the only reason the block is hidden is the null contract value.
    vi.mocked(tenantSettingsApi.getSettings).mockResolvedValue({
      revenueRecognitionEnabled: true,
      revenueRecognitionBasis: 'STRAIGHT_LINE',
    } as unknown as TenantSettings);
    vi.mocked(agreementApi.getBillingSchedule).mockResolvedValue({
      agreementId: 'a-1', amount: 27000, cadenceUnit: 'QUARTER', cadenceInterval: 1,
      anchorDate: '2024-09-01', netDays: 30, billingMode: 'FIXED_SCHEDULE', active: true,
    });
    vi.mocked(agreementApi.getRevenueRecognition).mockResolvedValue({
      basis: 'STRAIGHT_LINE',
      contractValue: null,
      recognizedToDate: 0,
      deferred: 0,
      visitsFulfilled: 0,
      visitsExpectedThisTerm: null,
    });
    renderPage();

    // Configured Financials card is up (footer shows net terms), but with
    // contractValue null the recognized/deferred row stays hidden.
    await screen.findByText(/Net 30 terms/i);
    expect(screen.queryByText('Recognized to date')).not.toBeInTheDocument();
    expect(screen.queryByText('Deferred')).not.toBeInTheDocument();
  });

  it('hides the recognition block when the tenant flag is off (even with billing)', async () => {
    // Gate stays OFF (the beforeEach default) — accrual content is opt-in.
    vi.mocked(agreementApi.getBillingSchedule).mockResolvedValue({
      agreementId: 'a-1', amount: 27000, cadenceUnit: 'QUARTER', cadenceInterval: 1,
      anchorDate: '2024-09-01', netDays: 30, billingMode: 'FIXED_SCHEDULE', active: true,
    });
    vi.mocked(agreementApi.getRevenueRecognition).mockResolvedValue({
      basis: 'PER_VISIT',
      contractValue: 108000,
      recognizedToDate: 27000,
      deferred: 81000,
      visitsFulfilled: 1,
      visitsExpectedThisTerm: 4,
    });
    renderPage();

    // Billing is configured (net terms render) but recognition is suppressed.
    await screen.findByText(/Net 30 terms/i);
    expect(screen.queryByText('Recognized to date')).not.toBeInTheDocument();
    expect(screen.queryByText(/work orders complete/)).not.toBeInTheDocument();
  });

  it('anchors the recognition block to time elapsed under straight-line basis', async () => {
    vi.mocked(tenantSettingsApi.getSettings).mockResolvedValue({
      revenueRecognitionEnabled: true,
      revenueRecognitionBasis: 'STRAIGHT_LINE',
    } as unknown as TenantSettings);
    vi.mocked(agreementApi.getBillingSchedule).mockResolvedValue({
      agreementId: 'a-1', amount: 27000, cadenceUnit: 'QUARTER', cadenceInterval: 1,
      anchorDate: '2024-09-01', netDays: 30, billingMode: 'FIXED_SCHEDULE', active: true,
    });
    vi.mocked(agreementApi.getRevenueRecognition).mockResolvedValue({
      basis: 'STRAIGHT_LINE',
      contractValue: 108000,
      recognizedToDate: 54000,
      deferred: 54000,
      visitsFulfilled: 1,
      visitsExpectedThisTerm: 4,
    });
    renderPage();

    expect(await screen.findByText('Recognized to date')).toBeInTheDocument();
    // Straight-line → ratable copy, never a visit count (compliance is 404 here,
    // so no "work orders complete" can leak in from the header either).
    expect(screen.getByText('recognized ratably over the term')).toBeInTheDocument();
    expect(screen.queryByText(/work orders complete/)).not.toBeInTheDocument();
  });

  it('renders the plan chip and member benefits on the Financials card', async () => {
    vi.mocked(agreementApi.getById).mockResolvedValue({
      ...agreement,
      planId: 'plan-1',
      benefits: {
        coveredPmVisits: 2,
        tripFeeWaived: true,
        laborDiscountPct: 15,
        partsDiscountPct: 10,
        priorityDispatch: true,
      },
    });
    vi.mocked(agreementPlanApi.getById).mockResolvedValue({
      id: 'plan-1',
      name: 'Comfort Club — Residential',
    } as unknown as AgreementPlanResponse);
    // Benefits/plan render in the configured (billing) branch.
    vi.mocked(agreementApi.getBillingSchedule).mockResolvedValue({
      agreementId: 'a-1', amount: 27000, cadenceUnit: 'QUARTER', cadenceInterval: 1,
      anchorDate: '2024-09-01', netDays: 30, billingMode: 'FIXED_SCHEDULE', active: true,
    });
    renderPage();

    // Included-term chips (count pluralized; percents; inclusions).
    expect(await screen.findByText('2 PM visits included')).toBeInTheDocument();
    expect(screen.getByText('Trip fee waived')).toBeInTheDocument();
    expect(screen.getByText('15% off labor')).toBeInTheDocument();
    expect(screen.getByText('10% off parts')).toBeInTheDocument();
    expect(screen.getByText('Priority dispatch')).toBeInTheDocument();
    // Plan provenance chip (resolved name).
    expect(screen.getByText('Comfort Club — Residential')).toBeInTheDocument();
  });
});
