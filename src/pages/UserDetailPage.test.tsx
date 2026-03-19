import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UserDetailPage from './UserDetailPage';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockRoles = [
  {
    id: 'role-1',
    name: 'Admin',
    description: 'Administrator role',
    capabilities: ['*:*'],
  },
  {
    id: 'role-2',
    name: 'Technician',
    description: 'Field technician role',
    capabilities: ['customers:read', 'work_orders:read'],
  },
];

const mockUser = {
  id: 'user-123',
  tenantId: 'tenant-1',
  cognitoSub: 'cognito-abc123',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
  enabled: true,
  roles: [mockRoles[0]],
  capabilities: ['*:*'],
  createdAt: '2024-01-01T10:30:00Z',
  updatedAt: '2024-01-15T14:45:00Z',
};

const mockDisabledUser = {
  ...mockUser,
  id: 'user-456',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane.smith@example.com',
  enabled: false,
  roles: [mockRoles[1]],
  capabilities: ['customers:read', 'work_orders:read'],
};

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('displays loading state while fetching user', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    expect(screen.getByText('Loading user...')).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('displays error state when user not found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked from error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/users');
  });
});
