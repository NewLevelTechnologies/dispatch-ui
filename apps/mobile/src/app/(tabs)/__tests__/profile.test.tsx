import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import ProfileScreen from '../profile';
import { useAuth } from '../../../auth/AuthContext';
import { useTenant } from '../../../tenant/TenantContext';
import type { TenantMembership } from '../../../api/setup';

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../tenant/TenantContext', () => ({ useTenant: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTenant = useTenant as jest.Mock;

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

const mockLeave = jest.fn();
const mockSwitchTenant = jest.fn();

const renderProfile = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ProfileScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ username: 'tech@acme.com', leave: mockLeave });
  mockUseTenant.mockReturnValue({
    memberships: [ACME],
    activeMembership: ACME,
    switchTenant: mockSwitchTenant,
  });
});

describe('ProfileScreen', () => {
  it('shows who is signed in and their active workspace', async () => {
    await renderProfile();
    expect(screen.getByText('Acme HVAC')).toBeTruthy();
    expect(screen.getByText('Signed in as tech@acme.com')).toBeTruthy();
  });

  it('omits the switcher section with only one membership', async () => {
    await renderProfile();
    expect(screen.queryByText('Switch workspace')).toBeNull();
  });

  it('offers to switch when there is more than one membership, excluding the active one', async () => {
    mockUseTenant.mockReturnValue({
      memberships: [ACME, GLOBEX],
      activeMembership: ACME,
      switchTenant: mockSwitchTenant,
    });
    await renderProfile();

    expect(screen.getByText('Switch workspace')).toBeTruthy();
    expect(screen.getByText('Globex Services')).toBeTruthy();

    await fireEvent.press(screen.getByText('Globex Services'));
    expect(mockSwitchTenant).toHaveBeenCalledWith(GLOBEX);
  });

  it('signs out when asked', async () => {
    await renderProfile();
    await fireEvent.press(screen.getByText('Sign out'));
    expect(mockLeave).toHaveBeenCalledTimes(1);
  });

  it('navigates to the style guide', async () => {
    await renderProfile();
    await fireEvent.press(screen.getByText('Style guide'));
    expect(mockPush).toHaveBeenCalledWith('/style-guide');
  });

  it('navigates to My Availability', async () => {
    await renderProfile();
    await fireEvent.press(screen.getByText('My Availability'));
    expect(mockPush).toHaveBeenCalledWith('/availability');
  });
});
