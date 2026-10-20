import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider, useTenant } from './TenantContext';
import { persistTenantId } from './tenant';
import { ThemeProvider } from '../theme/ThemeProvider';
import type { TenantMembership } from '../api/setup';

const mockListMyTenants = jest.fn();
const mockSetTenantRevokedHandler = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../api/setup', () => ({
  apiClient: { setTenantRevokedHandler: (...args: unknown[]) => mockSetTenantRevokedHandler(...args) },
  userApi: { listMyTenants: (...args: unknown[]) => mockListMyTenants(...args) },
}));

const ACME: TenantMembership = {
  tenantId: 'acme-id',
  tenantSlug: 'acme',
  companyName: 'Acme HVAC',
  userId: 'u1',
};
const GLOBEX: TenantMembership = {
  tenantId: 'globex-id',
  tenantSlug: 'globex',
  companyName: 'Globex Services',
  userId: 'u1',
};

/** Surfaces the context as text so assertions read like the user's view. */
function Probe() {
  const { activeMembership, resolution, memberships, revokedFrom, selectTenant, switchTenant } =
    useTenant();
  return (
    <>
      <Text>active:{activeMembership?.companyName ?? 'none'}</Text>
      <Text>resolution:{resolution?.kind ?? 'pending'}</Text>
      <Text>count:{memberships.length}</Text>
      <Text>revokedFrom:{revokedFrom?.companyName ?? 'none'}</Text>
      {memberships.map((m) => (
        <Text key={m.tenantId} onPress={() => selectTenant(m)}>
          select:{m.tenantId}
        </Text>
      ))}
      <Text onPress={() => switchTenant(GLOBEX)}>switch-to-globex</Text>
    </>
  );
}

const renderTenant = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TenantProvider>
          <Probe />
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

beforeEach(async () => {
  jest.clearAllMocks();
  // The AsyncStorage mock is a module-level store, not reset between tests —
  // without this, a stored tenant id from one test resolves silently in the
  // next one instead of showing the picker it expects.
  await AsyncStorage.clear();
  mockUseAuth.mockReturnValue({ status: 'signedIn' });
});

describe('TenantProvider resolution', () => {
  it('auto-resolves the single membership without a picker', async () => {
    mockListMyTenants.mockResolvedValue([ACME]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('active:Acme HVAC')).toBeTruthy());
    expect(screen.getByText('resolution:resolved')).toBeTruthy();
  });

  it('shows the picker when there is more than one membership and nothing stored', async () => {
    mockListMyTenants.mockResolvedValue([ACME, GLOBEX]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('resolution:picker')).toBeTruthy());
    expect(screen.getByText('active:none')).toBeTruthy();
  });

  it('resolves to the previously stored workspace', async () => {
    await persistTenantId('globex-id');
    mockListMyTenants.mockResolvedValue([ACME, GLOBEX]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('active:Globex Services')).toBeTruthy());
  });

  it('reports "none" with zero memberships', async () => {
    mockListMyTenants.mockResolvedValue([]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('resolution:none')).toBeTruthy());
  });

  it('does not run the bootstrap query before sign-in', async () => {
    mockUseAuth.mockReturnValue({ status: 'signedOut' });
    await renderTenant();
    expect(mockListMyTenants).not.toHaveBeenCalled();
  });
});

describe('TenantProvider selectTenant / switchTenant', () => {
  it('selectTenant resolves the chosen membership from the picker', async () => {
    mockListMyTenants.mockResolvedValue([ACME, GLOBEX]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('resolution:picker')).toBeTruthy());

    await firePress('select:acme-id');
    await waitFor(() => expect(screen.getByText('active:Acme HVAC')).toBeTruthy());
  });

  it('switchTenant shows the switching overlay naming the destination, then clears the cache', async () => {
    mockListMyTenants.mockResolvedValue([ACME, GLOBEX]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('resolution:picker')).toBeTruthy());

    await firePress('select:acme-id');
    await waitFor(() => expect(screen.getByText('active:Acme HVAC')).toBeTruthy());

    await firePress('switch-to-globex');
    await waitFor(() => expect(screen.getByText('Switching to Globex Services…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('active:Globex Services')).toBeTruthy());
  });
});

describe('TenantProvider revocation', () => {
  it('registers a revoked handler that latches revokedFrom and clears storage', async () => {
    mockListMyTenants.mockResolvedValue([ACME]);
    await renderTenant();
    await waitFor(() => expect(screen.getByText('active:Acme HVAC')).toBeTruthy());

    expect(mockSetTenantRevokedHandler).toHaveBeenCalled();
    const handler = mockSetTenantRevokedHandler.mock.calls.at(-1)?.[0] as () => void;
    // Called directly (not via a user gesture), so it needs its own act()
    // wrap — fireEvent provides that for a press, this doesn't.
    await act(async () => handler());

    await waitFor(() => expect(screen.getByText('revokedFrom:Acme HVAC')).toBeTruthy());
    // Revocation outranks the resolver — no tenant is active while it holds.
    expect(screen.getByText('active:none')).toBeTruthy();
  });
});

async function firePress(text: string) {
  await fireEvent.press(screen.getByText(text));
}
