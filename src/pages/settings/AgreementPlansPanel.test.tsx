import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import AgreementPlansPanel from './AgreementPlansPanel';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

const mockPlans = [
  {
    id: 'p-1', name: 'Comfort Club — Residential', kind: 'VISIT', classification: 'CONTRACT',
    defaultAmount: 300, defaultCadenceUnit: 'QUARTER', defaultCadenceInterval: 1, defaultNetDays: 30,
    defaultBillingMode: 'FIXED_SCHEDULE', defaultTermMonths: 12, defaultAutoRenew: true,
    defaultRenewalTermMonths: 12, defaultRenewalAlertDays: 90,
    benefits: { coveredPmVisits: 2, tripFeeWaived: true, laborDiscountPct: 15, partsDiscountPct: 10, priorityDispatch: true },
    active: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'p-2', name: 'Legacy Plan', kind: 'VISIT', classification: 'INTERNAL',
    defaultAmount: null, defaultCadenceUnit: null, defaultCadenceInterval: 1, defaultNetDays: 30,
    defaultBillingMode: 'FIXED_SCHEDULE', defaultTermMonths: null, defaultAutoRenew: false,
    defaultRenewalTermMonths: null, defaultRenewalAlertDays: null,
    benefits: {}, active: false, createdAt: '', updatedAt: '',
  },
];

describe('AgreementPlansPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockPlans } as never);
  });

  it('lists plans with billing defaults, a benefits summary, and status', async () => {
    renderWithProviders(<AgreementPlansPanel />);
    await waitFor(() => expect(screen.getByText('Comfort Club — Residential')).toBeInTheDocument());
    expect(screen.getByText('$300.00 · Quarterly')).toBeInTheDocument();
    expect(screen.getByText('2 PM · trip waived · 15% labor · 10% parts · priority')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Archived plan shows greyed with no billing default.
    expect(screen.getByText('Legacy Plan')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('opens the create form dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementPlansPanel />);
    await waitFor(() => expect(screen.getByText('Comfort Club — Residential')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /new plan/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New plan')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /plan name/i })).toBeInTheDocument();
  });

  it('archives a plan after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
    renderWithProviders(<AgreementPlansPanel />);
    await waitFor(() => expect(screen.getByText('Comfort Club — Residential')).toBeInTheDocument());

    // Only the active plan exposes an Archive action.
    await user.click(screen.getByRole('button', { name: /archive plan/i }));
    expect(await screen.findByText(/Archive .*Comfort Club/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^archive$/i }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith(expect.stringContaining('/agreement-plans/p-1')),
    );
  });
});
