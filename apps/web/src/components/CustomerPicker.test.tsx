import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import CustomerPicker from './CustomerPicker';
import { apiClient } from '../api/setup';
import type { CustomerSearchResult } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const standard: CustomerSearchResult = {
  id: 'c-1',
  name: 'Acme Plumbing',
  type: 'STANDARD',
  category: 'COMMERCIAL',
};

describe('CustomerPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: never-resolving search so query state never settles into
    // results during these synchronous tests (which exercise render-time
    // behavior — selection display, placeholder, disabled, dropdown open
    // -on-focus). Tests that drive the result list end-to-end live in
    // FinancialQuotesTab / QuoteDialog / InvoiceDialog where the
    // surrounding component already paces the flow.
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
  });

  it('renders the placeholder when no customer is selected', () => {
    renderWithProviders(<CustomerPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search customers/i)).toBeInTheDocument();
  });

  it('shows the selected customer name as the resting input value', () => {
    renderWithProviders(<CustomerPicker value={standard} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Acme Plumbing');
  });

  it('respects the disabled prop', () => {
    renderWithProviders(
      <CustomerPicker value={null} onChange={vi.fn()} disabled />,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('uses a custom placeholder when provided', () => {
    renderWithProviders(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        placeholder="Pick a payer"
      />,
    );
    expect(screen.getByPlaceholderText('Pick a payer')).toBeInTheDocument();
  });

  it('opens the dropdown on focus and prompts to type when below threshold', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerPicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('textbox'));
    expect(
      await screen.findByText(/type to search|type at least/i),
    ).toBeInTheDocument();
  });

  it('uses the picker label as the aria-label when ariaLabel is provided', () => {
    renderWithProviders(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        ariaLabel="Bill to"
      />,
    );
    expect(screen.getByLabelText('Bill to')).toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <CustomerPicker value={null} onChange={vi.fn()} />
        {/* eslint-disable-next-line i18next/no-literal-string -- test fixture */}
        <button type="button">outside</button>
      </div>,
    );
    await user.click(screen.getByRole('textbox'));
    expect(
      await screen.findByText(/type to search|type at least/i),
    ).toBeInTheDocument();
    // Click outside the picker — mousedown listener closes it.
    await user.click(screen.getByRole('button', { name: /outside/i }));
    expect(
      screen.queryByText(/type to search|type at least/i),
    ).not.toBeInTheDocument();
  });

  // Note on typing: the picker's onFocus schedules an inputRef.select()
  // via requestAnimationFrame to make a fresh typing session replace any
  // resting selection. Under suite load that rAF can fire BETWEEN
  // userEvent.type()'s per-character keystrokes, selecting the in-progress
  // text and letting the next char replace it — the input ends up holding
  // only the last typed character and the test sees no API call. Driving
  // the query with fireEvent.change is the equivalent of "the user pasted
  // the full term": one onChange event, no race with the rAF.
  it('renders results and selects one — calling onChange and clearing the typed query', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        content: [
          standard,
          {
            id: 'c-2',
            name: 'Quill Warranty',
            type: 'BILLING_ONLY',
            category: 'BILLING_ONLY',
          },
        ],
        totalElements: 2,
        totalPages: 1,
        number: 0,
        size: 25,
      },
    });

    renderWithProviders(<CustomerPicker value={null} onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    fireEvent.change(input, { target: { value: 'acme' } });

    // The debounce settles (300ms), the listbox renders both rows.
    const row = await screen.findByRole('option', { name: /acme plumbing/i }, { timeout: 5000 });
    const billingOnlyRow = screen.getByRole('option', { name: /quill warranty/i });
    expect(billingOnlyRow).toBeInTheDocument();
    // The badge span is the second child of the BILLING_ONLY <li>.
    expect(billingOnlyRow.children.length).toBe(2);

    // Selecting calls onChange and snaps the visible input back to the
    // selection (query cleared).
    await user.click(row);
    expect(onChange).toHaveBeenCalledWith(standard);
  });

  it('shows the no-results message when search returns an empty page', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 25 },
    });

    renderWithProviders(<CustomerPicker value={null} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    // Drive the query in one shot — see the rAF-vs-keystrokes note above.
    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(
      await screen.findByText(/no customers match/i, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
