import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import ActiveDispatchesWidget from './ActiveDispatchesWidget';
import apiClient from '../api/client';
import type { Dispatch, User } from '../api';

vi.mock('../api/client');

const mockUser = (firstName: string, lastName: string): User => ({
  id: `u-${firstName}`,
  tenantId: 't-1',
  cognitoSub: 'sub',
  email: `${firstName}@example.com`,
  firstName,
  lastName,
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const mockDispatch = (overrides: Partial<Dispatch> = {}): Dispatch => ({
  id: 'd-1',
  tenantId: 't-1',
  workOrderId: 'wo-1',
  assignedUserId: 'u-Jason',
  scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  status: 'SCHEDULED',
  createdAt: '2026-04-27T00:00:00Z',
  updatedAt: '2026-04-27T00:00:00Z',
  ...overrides,
});

describe('ActiveDispatchesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wireApi = (dispatches: Dispatch[], userByIdLookup: Record<string, User> = {}) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/scheduling/dispatches')) {
        return Promise.resolve({ data: dispatches });
      }
      if (url.includes('/users/')) {
        const id = url.split('/users/')[1]?.split('?')[0];
        const user = userByIdLookup[id];
        return user
          ? Promise.resolve({ data: user })
          : Promise.reject(new Error('User not found'));
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
  };

  it('returns null (renders nothing) when there are no dispatches', async () => {
    wireApi([]);
    const { container } = renderWithProviders(<ActiveDispatchesWidget workOrderId="wo-1" />);
    await waitFor(() => {
      expect(container.querySelector('section')).not.toBeInTheDocument();
    });
  });

  it('renders the heading and a card per active in-window dispatch', async () => {
    wireApi(
      [
        mockDispatch({ id: 'd-1', assignedUserId: 'u-Jason', status: 'SCHEDULED' }),
        mockDispatch({
          id: 'd-2',
          assignedUserId: 'u-Daniel',
          status: 'IN_PROGRESS',
          scheduledDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      ],
      {
        'u-Jason': mockUser('Jason', 'Smith'),
        'u-Daniel': mockUser('Daniel', 'Lopez'),
      }
    );
    renderWithProviders(<ActiveDispatchesWidget workOrderId="wo-1" />);

    await waitFor(() => {
      expect(screen.getByText('Active Dispatches')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.getByText('Daniel Lopez')).toBeInTheDocument();
    expect(screen.getByText('SCHEDULED')).toBeInTheDocument();
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
  });

  it('filters out terminal-state dispatches', async () => {
    wireApi(
      [
        mockDispatch({ id: 'd-1', status: 'COMPLETED' }),
        mockDispatch({ id: 'd-2', status: 'CANCELLED' }),
      ],
      { 'u-Jason': mockUser('Jason', 'Smith') }
    );
    const { container } = renderWithProviders(<ActiveDispatchesWidget workOrderId="wo-1" />);
    await waitFor(() => {
      // No dispatches survive the filter; widget renders nothing
      expect(container.querySelector('section')).not.toBeInTheDocument();
    });
  });

  it('filters out dispatches outside the ±24h window', async () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    wireApi(
      [mockDispatch({ id: 'd-1', scheduledDate: farFuture, status: 'SCHEDULED' })],
      { 'u-Jason': mockUser('Jason', 'Smith') }
    );
    const { container } = renderWithProviders(<ActiveDispatchesWidget workOrderId="wo-1" />);
    await waitFor(() => {
      expect(container.querySelector('section')).not.toBeInTheDocument();
    });
  });
});
