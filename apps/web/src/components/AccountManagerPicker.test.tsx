import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import AccountManagerPicker from './AccountManagerPicker';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const page = (content: { id: string; firstName: string; lastName: string; email: string }[]) => ({
  data: { content, page: 0, size: 20, totalElements: content.length, totalPages: 1 },
});

describe('AccountManagerPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: never-resolving so the search query never settles during the
    // synchronous render tests (mirrors CustomerPicker.test).
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
  });

  it('renders the placeholder when nothing is selected', () => {
    renderWithProviders(<AccountManagerPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search users/i)).toBeInTheDocument();
  });

  it('shows the selected manager name as the resting input value', () => {
    renderWithProviders(
      <AccountManagerPicker value={{ id: 'u-1', name: 'Linda Chen' }} onChange={vi.fn()} />
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Linda Chen');
  });

  it('respects the disabled prop', () => {
    renderWithProviders(<AccountManagerPicker value={null} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('clears the selection (Unassigned) when the clear button is clicked', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <AccountManagerPicker value={{ id: 'u-1', name: 'Linda Chen' }} onChange={onChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('lists assignable users on focus, before any typing', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      page([{ id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@co.com' }])
    );
    renderWithProviders(<AccountManagerPicker value={null} onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('textbox'));
    // Composed name shows (firstName + lastName), not the bare email. Generous
    // timeout: a 300ms debounce + fetch can exceed the 1000ms default on a
    // loaded machine.
    expect(await screen.findByText('Ada Lovelace', undefined, { timeout: 4000 })).toBeInTheDocument();
  });

  it('searches on type and calls onChange with the picked user', async () => {
    // Query-aware: empty (focus) query returns nothing, the typed query matches —
    // so the assertion exercises the typed search, not the focus list.
    vi.mocked(apiClient.get).mockImplementation((_url, config) => {
      const q = (config as { params?: { q?: string } } | undefined)?.params?.q;
      return Promise.resolve(
        q
          ? page([{ id: 'u-9', firstName: 'Marco', lastName: 'Castillo', email: 'marco@co.com' }])
          : page([])
      ) as ReturnType<typeof apiClient.get>;
    });
    const onChange = vi.fn();
    renderWithProviders(<AccountManagerPicker value={null} onChange={onChange} />);

    // Set the query atomically rather than char-by-char: userEvent.type races
    // the focus-fetch re-renders against the controlled input, so only the last
    // keystroke survived (q ended up "r"). fireEvent.change fires one onChange.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mar' } });
    const option = await screen.findByText('Marco Castillo', undefined, { timeout: 4000 });
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith({ id: 'u-9', name: 'Marco Castillo' });
    await waitFor(
      () =>
        expect(apiClient.get).toHaveBeenCalledWith('/users/assignable', expect.objectContaining({
          params: expect.objectContaining({ q: 'mar' }),
        })),
      { timeout: 4000 }
    );
  });
});
