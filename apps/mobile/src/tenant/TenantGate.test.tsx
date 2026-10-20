import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import TenantGate from './TenantGate';
import { useTenant } from './TenantContext';
import { useAuth } from '../auth/AuthContext';
import type { TenantMembership } from '../api/setup';

jest.mock('./TenantContext', () => ({ useTenant: jest.fn() }));
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUseTenant = useTenant as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

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

const BASE_TENANT = {
  memberships: [] as TenantMembership[],
  activeMembership: null as TenantMembership | null,
  resolution: null as { kind: string } | null,
  isLoading: false,
  error: null as unknown,
  revokedFrom: null as TenantMembership | null,
  selectTenant: jest.fn(),
  switchTenant: jest.fn(),
  refresh: jest.fn(),
};

const renderGate = () =>
  render(
    <ThemeProvider>
      <TenantGate>
        <Text>protected content</Text>
      </TenantGate>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ username: 'tech@acme.com', leave: jest.fn() });
  mockUseTenant.mockReturnValue(BASE_TENANT);
});

describe('TenantGate', () => {
  it('renders children once a membership is active', async () => {
    mockUseTenant.mockReturnValue({ ...BASE_TENANT, activeMembership: ACME, resolution: { kind: 'resolved' } });
    await renderGate();
    expect(screen.getByText('protected content')).toBeTruthy();
  });

  it('shows a loading state while bootstrap is in flight', async () => {
    mockUseTenant.mockReturnValue({ ...BASE_TENANT, isLoading: true });
    await renderGate();
    expect(screen.getByText('Loading your workspaces…')).toBeTruthy();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('shows a loading state while resolution is still pending (not yet loading, not yet resolved)', async () => {
    mockUseTenant.mockReturnValue({ ...BASE_TENANT, isLoading: false, resolution: null });
    await renderGate();
    expect(screen.getByText('Loading your workspaces…')).toBeTruthy();
  });

  it('offers a retry and sign out when the bootstrap call fails', async () => {
    const refresh = jest.fn();
    const leave = jest.fn();
    mockUseAuth.mockReturnValue({ username: 'tech@acme.com', leave });
    mockUseTenant.mockReturnValue({ ...BASE_TENANT, error: new Error('network'), refresh });
    await renderGate();

    expect(screen.getByText("Couldn’t load your workspaces")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refresh).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('shows the no-workspaces state with the signed-in email to give an admin', async () => {
    mockUseTenant.mockReturnValue({ ...BASE_TENANT, resolution: { kind: 'none' } });
    await renderGate();
    expect(screen.getByText('No workspaces available')).toBeTruthy();
    expect(screen.getByText('tech@acme.com')).toBeTruthy();
  });

  it('shows the picker for multiple memberships and resolves on a tap', async () => {
    const selectTenant = jest.fn();
    mockUseTenant.mockReturnValue({
      ...BASE_TENANT,
      memberships: [ACME, GLOBEX],
      resolution: { kind: 'picker' },
      selectTenant,
    });
    await renderGate();

    expect(screen.getByText('Choose a workspace')).toBeTruthy();
    expect(screen.getByText('Acme HVAC')).toBeTruthy();
    expect(screen.getByText('Globex Services')).toBeTruthy();

    await fireEvent.press(screen.getByText('Acme HVAC'));
    expect(selectTenant).toHaveBeenCalledWith(ACME);
  });

  it('prioritizes the revoked-access screen over everything else, listing only the remaining workspaces', async () => {
    mockUseTenant.mockReturnValue({
      ...BASE_TENANT,
      memberships: [ACME, GLOBEX],
      resolution: { kind: 'picker' },
      revokedFrom: ACME,
    });
    await renderGate();

    expect(screen.getByText('Your access to Acme HVAC ended')).toBeTruthy();
    expect(screen.queryByText('Acme HVAC')).toBeNull();
    expect(screen.getByText('Globex Services')).toBeTruthy();
  });
});
