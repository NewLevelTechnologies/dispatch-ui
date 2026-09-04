import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent, within } from '../../test/utils';
import WorkspaceBrand from './WorkspaceBrand';
import { useOptionalTenant } from '../../contexts/TenantContext';
import { tenantSettingsApi, type TenantMembership } from '../../api/setup';

vi.mock('../../contexts/TenantContext');
vi.mock('../../api/setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/setup')>()),
  tenantSettingsApi: { getSettings: vi.fn() },
}));

const ACME: TenantMembership = {
  tenantId: 'tenant-acme',
  tenantSlug: 'acme-hvac',
  companyName: 'ACME HVAC Services',
  userId: 'membership-1',
};
const GLOBEX: TenantMembership = {
  tenantId: 'tenant-globex',
  tenantSlug: 'globex-facilities',
  companyName: 'Globex Facilities',
  userId: 'membership-2',
};

const switchTenant = vi.fn();

function mockTenant(memberships: TenantMembership[], active: TenantMembership | null) {
  vi.mocked(useOptionalTenant).mockReturnValue({
    memberships,
    activeMembership: active,
    resolution: null,
    isLoading: false,
    error: null,
    revokedFrom: null,
    selectTenant: vi.fn(),
    switchTenant,
    refresh: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tenantSettingsApi.getSettings).mockResolvedValue({} as never);
});

describe('WorkspaceBrand', () => {
  it('names the active workspace instead of the product', () => {
    mockTenant([ACME], ACME);
    renderWithProviders(<WorkspaceBrand />);
    expect(screen.getByText('ACME HVAC Services')).toBeInTheDocument();
  });

  it('offers no switching affordance with a single workspace', () => {
    // The single-workspace majority must not see a control for something they
    // cannot do.
    mockTenant([ACME], ACME);
    renderWithProviders(<WorkspaceBrand />);
    expect(screen.queryByRole('button', { name: /switch workspace/i })).not.toBeInTheDocument();
  });

  it('becomes a switcher once there is more than one', async () => {
    const user = userEvent.setup();
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(await screen.findByRole('menuitem', { name: /globex facilities/i })).toBeInTheDocument();
  });

  it('switches to the chosen workspace', async () => {
    const user = userEvent.setup();
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    await user.click(await screen.findByRole('menuitem', { name: /globex facilities/i }));
    expect(switchTenant).toHaveBeenCalledWith(GLOBEX);
  });

  it('does not re-switch to the workspace already active', async () => {
    // Re-selecting the current one would clear the query cache for nothing.
    const user = userEvent.setup();
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    await user.click(await screen.findByRole('menuitem', { name: /acme hvac/i }));
    expect(switchTenant).not.toHaveBeenCalled();
  });

  it('gives every row a monogram and its slug', async () => {
    // Both went missing when the rows were plain text, and the slug is what
    // separates two workspaces with similar names.
    const user = userEvent.setup();
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    await screen.findByRole('menuitem', { name: /globex facilities/i });

    // Scoped to the menu: the active workspace's monogram also renders in the
    // brand block itself, so an unscoped query matches twice.
    const menu = within(screen.getByRole('menu'));
    expect(menu.getByText('AH')).toBeInTheDocument();
    expect(menu.getByText('GF')).toBeInTheDocument();
    expect(menu.getByText('acme-hvac')).toBeInTheDocument();
    expect(menu.getByText('globex-facilities')).toBeInTheDocument();
  });

  it('keeps the environment badge alongside the workspace name', () => {
    // Knowing you are on prod outranks reading a long company name.
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(
      <WorkspaceBrand envBadge={{ label: 'DEV', className: 'test-badge' }} />
    );
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('ACME HVAC Services')).toBeInTheDocument();
  });

  it('renders without a tenant provider rather than taking the sidebar down', () => {
    vi.mocked(useOptionalTenant).mockReturnValue(null);
    expect(() => renderWithProviders(<WorkspaceBrand />)).not.toThrow();
  });
});
