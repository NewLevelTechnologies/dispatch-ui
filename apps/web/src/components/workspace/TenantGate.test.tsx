import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantGate from './TenantGate';
import { useTenant } from '../../contexts/TenantContext';
import type { TenantMembership } from '../../api/setup';

vi.mock('../../contexts/TenantContext');

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

const selectTenant = vi.fn();

function mockTenant(over: Partial<ReturnType<typeof useTenant>> = {}) {
  vi.mocked(useTenant).mockReturnValue({
    memberships: [],
    activeMembership: null,
    resolution: null,
    isLoading: false,
    error: null,
    revokedFrom: null,
    selectTenant,
    switchTenant: vi.fn(),
    refresh: vi.fn(),
    ...over,
  });
}

const APP = <div>Work orders</div>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TenantGate', () => {
  it('renders the app once a workspace is active', () => {
    mockTenant({ activeMembership: ACME, memberships: [ACME] });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('Work orders')).toBeInTheDocument();
  });

  it('shows the picker when several workspaces and nothing resolved', () => {
    mockTenant({ memberships: [ACME, GLOBEX], resolution: { kind: 'picker' } });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('Choose a workspace')).toBeInTheDocument();
    expect(screen.getByText('ACME HVAC Services')).toBeInTheDocument();
    expect(screen.queryByText('Work orders')).not.toBeInTheDocument();
  });

  it('shows the slug, never the tenant id', () => {
    mockTenant({ memberships: [ACME, GLOBEX], resolution: { kind: 'picker' } });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('acme-hvac')).toBeInTheDocument();
    expect(screen.queryByText('tenant-acme')).not.toBeInTheDocument();
  });

  it('commits a workspace on a single click', async () => {
    const user = userEvent.setup();
    mockTenant({ memberships: [ACME, GLOBEX], resolution: { kind: 'picker' } });
    render(<TenantGate>{APP}</TenantGate>);
    await user.click(screen.getByText('Globex Facilities'));
    expect(selectTenant).toHaveBeenCalledWith(GLOBEX);
  });

  it('shows the zero-membership status when the list is empty', () => {
    mockTenant({ resolution: { kind: 'none' } });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('No workspaces available')).toBeInTheDocument();
  });

  it('does not claim zero memberships when the bootstrap call failed', () => {
    // The distinction matters: one asserts something about their access, the
    // other admits we do not know.
    mockTenant({ error: new Error('network') });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('Couldn’t load your workspaces')).toBeInTheDocument();
    expect(screen.queryByText('No workspaces available')).not.toBeInTheDocument();
  });

  it('names the lost workspace on revocation and offers the rest', () => {
    mockTenant({ memberships: [GLOBEX], revokedFrom: ACME, activeMembership: null });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('Your access to ACME HVAC Services ended')).toBeInTheDocument();
    expect(screen.getByText('Globex Facilities')).toBeInTheDocument();
  });

  it('keeps revocation in front of the app even while a workspace is still active', () => {
    // The 403 can land while activeMembership is set; the dead page must not
    // render behind it.
    mockTenant({ memberships: [GLOBEX], revokedFrom: ACME, activeMembership: ACME });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.queryByText('Work orders')).not.toBeInTheDocument();
  });

  it('lists the workspaces they do have when the host names an unknown one', () => {
    mockTenant({
      memberships: [ACME],
      resolution: { kind: 'unknown-workspace', slug: 'northwind' },
    });
    render(<TenantGate>{APP}</TenantGate>);
    expect(screen.getByText('You’re not a member of this workspace')).toBeInTheDocument();
    expect(screen.getByText('northwind')).toBeInTheDocument();
    expect(screen.getByText('ACME HVAC Services')).toBeInTheDocument();
  });
});
