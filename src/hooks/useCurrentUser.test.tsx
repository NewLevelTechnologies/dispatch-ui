import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCurrentUser, useHasCapability, useHasAnyCapability, useHasAllCapabilities } from './useCurrentUser';
import { userApi, type User } from '../api';

// Unmock the hook for this test file
vi.unmock('./useCurrentUser');

// Mock the API instead
vi.mock('../api', () => ({
  userApi: {
    getCurrentUser: vi.fn(),
  },
}));

// Create a wrapper component with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockUser: User = {
  id: 'user-123',
  tenantId: 'tenant-123',
  cognitoSub: 'cognito-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  enabled: true,
  capabilities: ['VIEW_USERS', 'EDIT_USERS', 'VIEW_CUSTOMERS'],
  roles: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and returns current user data', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockUser);
    expect(result.current.error).toBeNull();
    expect(userApi.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('handles error when fetching current user fails', async () => {
    const error = new Error('API Error');
    vi.mocked(userApi.getCurrentUser).mockRejectedValue(error);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });
});

describe('useHasCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when user has the capability', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useHasCapability('VIEW_USERS'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('returns false when user does not have the capability', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useHasCapability('DELETE_CUSTOMERS'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('returns false when user data is not loaded', () => {
    vi.mocked(userApi.getCurrentUser).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useHasCapability('VIEW_USERS'), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(false);
  });
});

describe('useHasAnyCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when user has at least one capability', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(
      () => useHasAnyCapability('DELETE_USERS', 'VIEW_USERS', 'SOME_OTHER'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('returns false when user has none of the capabilities', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(
      () => useHasAnyCapability('DELETE_CUSTOMERS', 'ARCHIVE_CUSTOMERS'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});

describe('useHasAllCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when user has all capabilities', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(
      () => useHasAllCapabilities('VIEW_USERS', 'EDIT_USERS'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('returns false when user is missing at least one capability', async () => {
    vi.mocked(userApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(
      () => useHasAllCapabilities('VIEW_USERS', 'DELETE_USERS', 'DELETE_CUSTOMERS'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
