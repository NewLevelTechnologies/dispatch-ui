import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ActivityButton from './ActivityButton';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const STORAGE_KEY = 'wo-activity-last-seen:wo-1';

function mockActivityList(latestIso: string | null) {
  vi.mocked(apiClient.get).mockResolvedValueOnce({
    data: {
      content: latestIso
        ? [
            {
              id: 'e-1',
              timestamp: latestIso,
              category: 'NOTE',
              actor: { id: 'u-1', firstName: 'X', lastName: 'Y' },
            },
          ]
        : [],
      nextCursor: null,
    },
  });
}

describe('ActivityButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the Activity label and triggers onOpen when clicked', async () => {
    mockActivityList(null);
    const onOpen = vi.fn();
    renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={false} onOpen={onOpen} />,
    );

    const btn = screen.getByRole('button', { name: /activity/i });
    await userEvent.click(btn);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the unread dot when the latest event is newer than the stored last-seen', async () => {
    window.localStorage.setItem(STORAGE_KEY, '2026-01-01T00:00:00Z');
    mockActivityList('2026-02-01T00:00:00Z');

    const { container } = renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={false} onOpen={vi.fn()} />,
    );

    // The dot is an aria-hidden span; wait for the query to resolve and
    // the dot to appear.
    await waitFor(() => {
      expect(container.querySelector('span[aria-hidden="true"].rounded-full')).toBeInTheDocument();
    });
  });

  it('hides the dot while the drawer is already open', async () => {
    window.localStorage.setItem(STORAGE_KEY, '2026-01-01T00:00:00Z');
    mockActivityList('2026-02-01T00:00:00Z');

    const { container } = renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={true} onOpen={vi.fn()} />,
    );

    // Even after the query resolves, drawerOpen suppresses the dot.
    await waitFor(() => {
      expect(vi.mocked(apiClient.get)).toHaveBeenCalled();
    });
    expect(container.querySelector('span[aria-hidden="true"].rounded-full')).not.toBeInTheDocument();
  });

  it('writes lastSeen on click so the dot disappears on next render', async () => {
    mockActivityList('2026-02-01T00:00:00Z');

    const onOpen = vi.fn();
    renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={false} onOpen={onOpen} />,
    );

    await waitFor(() => {
      expect(vi.mocked(apiClient.get)).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole('button', { name: /activity/i }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('2026-02-01T00:00:00Z');
    expect(onOpen).toHaveBeenCalled();
  });

  it('survives a localStorage read failure by falling back to no last-seen', async () => {
    // Simulate a privacy-mode-style failure on read.
    const original = window.localStorage.getItem;
    window.localStorage.getItem = vi.fn(() => {
      throw new Error('blocked');
    });
    mockActivityList(null);

    renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={false} onOpen={vi.fn()} />,
    );

    // Component still renders without throwing.
    expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument();

    window.localStorage.getItem = original;
  });

  it('survives a localStorage write failure on click', async () => {
    mockActivityList('2026-02-01T00:00:00Z');
    const original = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn(() => {
      throw new Error('blocked');
    });
    const onOpen = vi.fn();

    renderWithProviders(
      <ActivityButton workOrderId="wo-1" drawerOpen={false} onOpen={onOpen} />,
    );

    await waitFor(() => {
      expect(vi.mocked(apiClient.get)).toHaveBeenCalled();
    });
    await userEvent.click(screen.getByRole('button', { name: /activity/i }));

    // onOpen still fires — the write swallowed silently.
    expect(onOpen).toHaveBeenCalled();
    window.localStorage.setItem = original;
  });
});
