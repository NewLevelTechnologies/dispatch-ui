import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WorkspaceRow } from './WorkspaceRow';
import type { TenantMembership } from '../api/setup';

const ACME: TenantMembership = {
  tenantId: 'acme-id',
  tenantSlug: 'acme',
  companyName: 'Acme HVAC',
  userId: 'u1',
};

describe('WorkspaceRow', () => {
  it('renders the company name, slug and monogram', async () => {
    await render(
      <ThemeProvider>
        <WorkspaceRow membership={ACME} onPress={jest.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByText('Acme HVAC')).toBeTruthy();
    expect(screen.getByText('acme')).toBeTruthy();
    expect(screen.getByText('AH')).toBeTruthy();
  });

  it('calls onPress with the membership when tapped', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <WorkspaceRow membership={ACME} onPress={onPress} />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledWith(ACME);
  });
});
