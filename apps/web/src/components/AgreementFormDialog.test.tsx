import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AgreementFormDialog from './AgreementFormDialog';
import { agreementApi, agreementPlanApi, customerApi } from '../api/setup';

vi.mock('../api/setup', () => ({
  agreementApi: { create: vi.fn(), update: vi.fn() },
  agreementPlanApi: { getAll: vi.fn() },
  customerApi: { getAllPaginated: vi.fn() },
}));
vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

const plan = {
  id: 'plan-1', name: 'Comfort Club — Residential', kind: 'VISIT', classification: 'CONTRACT',
  defaultAmount: 300, defaultCadenceUnit: 'QUARTER', defaultCadenceInterval: 1, defaultNetDays: 30,
  defaultBillingMode: 'FIXED_SCHEDULE', defaultTermMonths: 12, defaultAutoRenew: true,
  defaultRenewalTermMonths: 12, defaultRenewalAlertDays: 90, benefits: {}, active: true, createdAt: '', updatedAt: '',
};

describe('AgreementFormDialog — sell from a plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementPlanApi.getAll).mockResolvedValue({
      content: [plan], totalElements: 1, totalPages: 1, number: 0, size: 200,
    } as never);
    vi.mocked(agreementApi.create).mockResolvedValue({ id: 'a-9' } as never);
  });

  it('pre-fills the term from a plan and POSTs planId + classification', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementFormDialog isOpen onClose={vi.fn()} customerId="c-1" />);
    const dialog = await screen.findByRole('dialog');

    // Plan picker appears once active plans load.
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /comfort club/i })).toBeInTheDocument());
    await user.selectOptions(within(dialog).getByRole('combobox'), 'plan-1');
    await user.type(within(dialog).getByRole('textbox', { name: /name/i }), 'Acme Quarterly');

    // Plan carries a 12-month term → picking a start derives the end.
    const start = dialog.querySelector('input[name="termStart"]') as HTMLInputElement;
    fireEvent.change(start, { target: { value: '2026-01-01' } });

    await user.click(within(dialog).getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(agreementApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Quarterly',
          planId: 'plan-1',
          classification: 'CONTRACT',
          termEnd: '2027-01-01',
        }),
      ),
    );
  });

  it('stays bespoke (planId null) when no plan is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementFormDialog isOpen onClose={vi.fn()} customerId="c-1" />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toBeInTheDocument());

    await user.type(within(dialog).getByRole('textbox', { name: /name/i }), 'Bespoke Agreement');
    await user.click(within(dialog).getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(agreementApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bespoke Agreement', planId: null, classification: 'CONTRACT' }),
      ),
    );
  });
});

describe('AgreementFormDialog — sold from the agreements list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementPlanApi.getAll).mockResolvedValue({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 200,
    } as never);
    vi.mocked(agreementApi.create).mockResolvedValue({ id: 'a-9' } as never);
    vi.mocked(customerApi.getAllPaginated).mockResolvedValue({
      content: [
        {
          id: 'c-7', name: 'Acme Diner', customerNumber: 'C-1442', serviceLocationCount: 3,
          billingAddress: { streetAddress: '100 MAIN ST', city: 'SPRINGFIELD', state: 'IL' },
        },
      ],
      totalElements: 1, totalPages: 1, number: 0, size: 25,
    } as never);
  });

  it('asks for the customer first and creates for the one picked', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<AgreementFormDialog isOpen onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByRole('textbox', { name: /name/i }), 'Kitchen PM');
    // No customer yet: nothing to create it for.
    expect(within(dialog).getByRole('button', { name: /create/i })).toBeDisabled();

    const picker = within(dialog).getByRole('textbox', { name: 'Customer' });
    await user.click(picker);
    fireEvent.change(picker, { target: { value: 'acme' } });
    await user.click(await screen.findByRole('option', { name: /acme diner/i }, { timeout: 5000 }));
    await user.click(within(dialog).getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(agreementApi.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c-7', name: 'Kitchen PM' })),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?from=agreements'));
  });
});
