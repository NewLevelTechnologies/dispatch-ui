import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AgreementPlanFormDialog from './AgreementPlanFormDialog';
import { apiClient } from '../api/setup';
import type { AgreementPlanResponse } from '../api/setup';

vi.mock('@dispatch/api/src/client');
vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

const existingPlan: AgreementPlanResponse = {
  id: 'p-1',
  name: 'Comfort Club — Residential',
  kind: 'VISIT',
  classification: 'CONTRACT',
  defaultAmount: 300,
  defaultCadenceUnit: 'QUARTER',
  defaultCadenceInterval: 1,
  defaultNetDays: 30,
  defaultBillingMode: 'FIXED_SCHEDULE',
  defaultTermMonths: 12,
  defaultAutoRenew: true,
  defaultRenewalTermMonths: 12,
  defaultRenewalAlertDays: 90,
  benefits: { coveredPmVisits: 2, tripFeeWaived: true, laborDiscountPct: 15, partsDiscountPct: 10, priorityDispatch: true },
  active: true,
  createdAt: '',
  updatedAt: '',
};

describe('AgreementPlanFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
  });

  it('creates a plan with benefits (kind locked to VISIT)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementPlanFormDialog isOpen onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByRole('textbox', { name: /plan name/i }), 'Comfort Club');
    await user.type(within(dialog).getByRole('spinbutton', { name: /labor discount/i }), '15');
    await user.click(within(dialog).getByRole('switch', { name: /priority dispatch/i }));
    await user.click(within(dialog).getByRole('button', { name: /add plan/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/agreement-plans',
        expect.objectContaining({
          name: 'Comfort Club',
          kind: 'VISIT',
          benefits: expect.objectContaining({ laborDiscountPct: 15, priorityDispatch: true }),
        }),
      ),
    );
  });

  it('pre-fills from an existing plan and PATCHes the changed name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementPlanFormDialog isOpen onClose={vi.fn()} plan={existingPlan} />);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Edit plan')).toBeInTheDocument();
    const nameInput = within(dialog).getByRole('textbox', { name: /plan name/i });
    expect(nameInput).toHaveValue('Comfort Club — Residential');
    // Auto-renew on → renewal fields revealed (pre-filled).
    expect(within(dialog).getByRole('spinbutton', { name: /renewal term/i })).toHaveValue(12);

    await user.clear(nameInput);
    await user.type(nameInput, 'Comfort Club — Premium');
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/agreement-plans/p-1',
        expect.objectContaining({ name: 'Comfort Club — Premium' }),
      ),
    );
  });
});
