import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '../test/utils';
import BillingSetupDialog from './BillingSetupDialog';
import apiClient from '../api/client';

vi.mock('../api/client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.put).mockResolvedValue({ data: {} } as never);
});

describe('BillingSetupDialog', () => {
  it('PUTs a new schedule mapped 1:1 from the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BillingSetupDialog isOpen onClose={() => {}} agreementId="a-1" defaultAnchorDate="2026-07-01" />,
    );

    expect(screen.getByText('Set up billing')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('300'), '300');
    await user.click(screen.getByRole('button', { name: /save billing/i }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith(
      '/work-orders/agreements/a-1/billing-schedule',
      expect.objectContaining({
        amount: 300,
        cadenceUnit: 'QUARTER',
        cadenceInterval: 1,
        anchorDate: '2026-07-01',
        netDays: 30,
        billingMode: 'FIXED_SCHEDULE',
        active: true,
      }),
    );
  });

  it('maps every edited field into the PUT body', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BillingSetupDialog isOpen onClose={() => {}} agreementId="a-1" defaultAnchorDate="2026-07-01" />,
    );

    await user.type(screen.getByPlaceholderText('300'), '500');
    const [cadenceSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(cadenceSelect, 'MONTH');
    const interval = screen.getByDisplayValue('1');
    await user.clear(interval);
    await user.type(interval, '3');
    const net = screen.getByDisplayValue('30');
    await user.clear(net);
    await user.type(net, '45');
    await user.click(screen.getByRole('checkbox')); // toggle Active off

    await user.click(screen.getByRole('button', { name: /save billing/i }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith(
      '/work-orders/agreements/a-1/billing-schedule',
      expect.objectContaining({
        amount: 500,
        cadenceUnit: 'MONTH',
        cadenceInterval: 3,
        netDays: 45,
        active: false,
      }),
    );
  });

  it('shows the derived schedule preview as the amount changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BillingSetupDialog isOpen onClose={() => {}} agreementId="a-1" defaultAnchorDate="2026-07-01" />,
    );
    await user.type(screen.getByPlaceholderText('300'), '300');
    // Quarterly × $300 → derived ARR $1,200/yr, plus the preview footnote.
    expect(await screen.findByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText(/Preview — actual invoices appear/i)).toBeInTheDocument();
  });

  it('prefills from an existing schedule in edit mode', () => {
    renderWithProviders(
      <BillingSetupDialog
        isOpen
        onClose={() => {}}
        agreementId="a-1"
        billing={{
          agreementId: 'a-1',
          amount: 500,
          cadenceUnit: 'MONTH',
          cadenceInterval: 1,
          anchorDate: '2026-01-01',
          netDays: 45,
          billingMode: 'FIXED_SCHEDULE',
          active: true,
        }}
      />,
    );
    expect(screen.getByText('Edit billing schedule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
  });
});
