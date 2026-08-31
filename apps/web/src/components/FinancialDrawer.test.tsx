import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import FinancialDrawer from './FinancialDrawer';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

describe('FinancialDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // FinancialInvoicesTab inside the Invoices panel fires a fetch on
    // mount; stub it with an empty list so these shell-level tests don't
    // hit the "unmocked endpoint" path.
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  const defaults = {
    open: true,
    onClose: vi.fn(),
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-00010',
    customerId: 'cust-1',
    customerName: 'Tenant 2 Inc.',
  };

  it('renders the title with the WO number', () => {
    renderWithProviders(<FinancialDrawer {...defaults} />);
    // Title uses the work_order glossary singular ("Work Order" by default).
    expect(
      screen.getByText('Financials · Work Order #WO-00010'),
    ).toBeInTheDocument();
  });

  it('renders three tab labels in WO-lifecycle (chronological) order — no Payments tab', () => {
    renderWithProviders(<FinancialDrawer {...defaults} />);
    const tabs = screen.getAllByRole('tab');
    // §3.3 fold removed the Payments tab — payments now nest under each
    // invoice's row expansion in the Invoices tab.
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent('Quotes');
    expect(tabs[1]).toHaveTextContent('POs');
    expect(tabs[2]).toHaveTextContent('Invoices');
    expect(screen.queryByRole('tab', { name: 'Payments' })).not.toBeInTheDocument();
  });

  it('selects the Invoices tab by default (live billable surface in 7a)', () => {
    renderWithProviders(<FinancialDrawer {...defaults} />);
    const invoicesTab = screen.getByRole('tab', { name: 'Invoices' });
    expect(invoicesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('honors the `initialTab` prop on mount', () => {
    renderWithProviders(<FinancialDrawer {...defaults} initialTab="quotes" />);
    const quotesTab = screen.getByRole('tab', { name: 'Quotes' });
    expect(quotesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('lets the user switch tabs inside the drawer (uncontrolled)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialDrawer {...defaults} />);
    const quotesTab = screen.getByRole('tab', { name: 'Quotes' });
    await user.click(quotesTab);
    expect(quotesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the live Invoices tab on default (no "Coming soon" stub)', async () => {
    renderWithProviders(<FinancialDrawer {...defaults} />);
    // Invoices is live (FinancialInvoicesTab renders its own empty/loading
    // states from the WO-scoped list endpoint).
    expect(
      await screen.findByText(/No invoices on this work order yet/i),
    ).toBeInTheDocument();
  });

  it('renders the "Coming soon" stub on the POs tab (7c, no backend entity)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialDrawer {...defaults} />);
    // Quotes tab is now live (7b). POs remain stubbed until 7c.
    await user.click(screen.getByRole('tab', { name: 'POs' }));
    expect(screen.getByText(/Deferred to phase 7c/i)).toBeInTheDocument();
  });

  it('renders the live Quotes tab (no longer a stub in 7b)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialDrawer {...defaults} />);
    await user.click(screen.getByRole('tab', { name: 'Quotes' }));
    // Empty state with a + New Quote affordance, not the Coming-soon copy.
    expect(
      await screen.findByText(/No quotes on this work order yet/i),
    ).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<FinancialDrawer {...defaults} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
