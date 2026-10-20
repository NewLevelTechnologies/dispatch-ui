import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useAuth } from '../auth/AuthContext';
import { userApi } from '../api/setup';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api/setup', () => ({ userApi: { getCurrentUser: jest.fn() } }));

const mockUseAuth = useAuth as jest.Mock;
const mockGetCurrentUser = userApi.getCurrentUser as jest.Mock;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useCurrentUser', () => {
  it('fetches the current user once signed in', async () => {
    mockUseAuth.mockReturnValue({ status: 'signedIn' });
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'tech@acme.com' });

    // RNTL 14's renderHook is async, same as render() — see src/test/rn-toolchain.test.tsx.
    const { result } = await renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ id: 'user-1', email: 'tech@acme.com' }));
  });

  it('does not fetch before sign-in', async () => {
    mockUseAuth.mockReturnValue({ status: 'signedOut' });

    await renderHook(() => useCurrentUser(), { wrapper });

    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });
});
