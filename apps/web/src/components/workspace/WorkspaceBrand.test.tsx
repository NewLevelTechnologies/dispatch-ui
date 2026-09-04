import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent, within } from '../../test/utils';
import WorkspaceBrand from './WorkspaceBrand';
import { useOptionalTenant } from '../../contexts/TenantContext';
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

  it('gives the whole block to the company name', () => {
    // Nothing else shares this row — the environment badge moved to the topbar
    // so a long company name is not the thing that gets truncated at 220px.
    mockTenant([ACME, GLOBEX], ACME);
    renderWithProviders(<WorkspaceBrand />);
    expect(screen.getByTitle('ACME HVAC Services')).toBeInTheDocument();
  });

  it('falls back to derived initials when the tenant has no logo', () => {
    mockTenant([ACME], ACME);
    renderWithProviders(<WorkspaceBrand />);
    expect(screen.getByText('AH')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('prefers the tenant logo on the trigger when one is set', () => {
    // Off the membership list, not tenant-settings: that query is tenant-scoped
    // and evicted on switch, which used to blank the mark during the refetch.
    const branded = { ...ACME, logoUrl: 'https://cdn.test/acme.png' };
    mockTenant([branded], branded);
    renderWithProviders(<WorkspaceBrand />);

    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.test/acme.png');
    expect(screen.queryByText('AH')).not.toBeInTheDocument();
  });

  it('gives each row its own logo, so every workspace is recognisable', async () => {
    // The whole point of the field: a logo you can only see once you are
    // already inside a workspace cannot help you choose one.
    const user = userEvent.setup();
    const brandedAcme = { ...ACME, logoUrl: 'https://cdn.test/acme.png' };
    const brandedGlobex = { ...GLOBEX, logoUrl: 'https://cdn.test/globex.png' };
    mockTenant([brandedAcme, brandedGlobex], brandedAcme);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    await screen.findByRole('menuitem', { name: /globex facilities/i });

    // Queried as <img> rather than by role: SVG icons in the row also resolve
    // to a presentation role, so the role query is not specific to logos.
    const srcs = Array.from(screen.getByRole('menu').querySelectorAll('img')).map((el) =>
      el.getAttribute('src')
    );
    expect(srcs).toEqual(['https://cdn.test/acme.png', 'https://cdn.test/globex.png']);
  });

  it('falls back per row, so a logo-less workspace beside a branded one still reads', async () => {
    const user = userEvent.setup();
    const brandedAcme = { ...ACME, logoUrl: 'https://cdn.test/acme.png' };
    mockTenant([brandedAcme, GLOBEX], brandedAcme);
    renderWithProviders(<WorkspaceBrand />);

    await user.click(screen.getByRole('button', { name: /switch workspace/i }));
    await screen.findByRole('menuitem', { name: /globex facilities/i });

    const menu = screen.getByRole('menu');
    const imgs = Array.from(menu.querySelectorAll('img'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn.test/acme.png');
    expect(within(menu).getByText('GF')).toBeInTheDocument();
  });

  it('renders without a tenant provider rather than taking the sidebar down', () => {
    vi.mocked(useOptionalTenant).mockReturnValue(null);
    expect(() => renderWithProviders(<WorkspaceBrand />)).not.toThrow();
  });
});
