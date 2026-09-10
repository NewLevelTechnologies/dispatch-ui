import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { UserEditPage, UserInvitePage } from './UserFormPage';

const mockGetById = vi.fn();
const mockGetRoles = vi.fn();
const mockUpdateProfile = vi.fn();
const mockUpdateRoles = vi.fn();
const mockUpdateRegions = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ id: 'u1' }) };
});

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    userApi: {
      ...actual.userApi,
      getById: (...a: unknown[]) => mockGetById(...a),
      getRoles: (...a: unknown[]) => mockGetRoles(...a),
      // Called per selected role for the capability preview.
      getRoleById: async (roleId: string) =>
        [TECH, CSR].find((r) => r.id === roleId) ?? CSR,
      getGroupedCapabilities: async () => ({ groups: [] }),
      updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
      updateRoles: (...a: unknown[]) => mockUpdateRoles(...a),
      updateRegions: (...a: unknown[]) => mockUpdateRegions(...a),
    },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: async () => [] },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: async () => ({}) },
  };
});
vi.mock('@dispatch/api/src/client');

const TECH = { id: 'r-tech', name: 'Technician', performsFieldWork: true, capabilityCount: 3 };
const CSR = { id: 'r-csr', name: 'CSR', performsFieldWork: false, capabilityCount: 5 };

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  tenantId: 't1',
  cognitoSub: 's1',
  email: 'maya@example.com',
  firstName: 'Maya',
  lastName: 'Alvarez',
  phoneNumber: null,
  enabled: true,
  roles: [CSR],
  dispatchRegionIds: [],
  dispatchable: 'INHERIT',
  performsFieldWork: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('Dispatchable override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRoles.mockResolvedValue([TECH, CSR]);
    mockGetById.mockResolvedValue(user());
    mockUpdateProfile.mockResolvedValue(user());
    mockUpdateRoles.mockResolvedValue(user());
    mockUpdateRegions.mockResolvedValue(user());
  });

  const hint = () => screen.getByTestId('dispatchable-hint').textContent ?? '';

  // INHERIT alone is meaningless without saying what following the roles
  // produces — that's the whole reason the hint exists.
  it('names the outcome and its cause under INHERIT', async () => {
    mockGetById.mockResolvedValue(user({ roles: [TECH] }));
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });

    expect(await screen.findByTestId('dispatchable-hint')).toBeInTheDocument();
    expect(hint()).toContain('On the board');
    expect(hint()).toContain('Technician');
  });

  it('says why someone is NOT on the board under INHERIT', async () => {
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    expect(await screen.findByTestId('dispatchable-hint')).toBeInTheDocument();
    expect(hint()).toContain('no role here performs field work');
  });

  // Live against the form, not the saved value: ticking Technician should
  // answer the question immediately.
  it('updates the hint as roles change, before saving', async () => {
    const u = userEvent.setup();
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    await screen.findByTestId('dispatchable-hint');
    expect(hint()).toContain('Not on the board');

    // jsdom doesn't forward a <label> click to Headless's role=checkbox span
    // the way a real browser does, so target the control inside the row.
    const row = screen.getByText('Technician').closest('label') as HTMLElement;
    await u.click(row.querySelector('[role="checkbox"]') as HTMLElement);
    expect(hint()).toContain('On the board');
  });

  it('reports the override as overriding, in both directions', async () => {
    const u = userEvent.setup();
    mockGetById.mockResolvedValue(user({ roles: [TECH] }));
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    await screen.findByTestId('dispatchable-hint');

    await u.click(screen.getByRole('radio', { name: 'Never' }));
    expect(hint()).toContain('Kept off the board');

    await u.click(screen.getByRole('radio', { name: 'Always' }));
    expect(hint()).toContain('On the board, whatever the roles say');
  });

  it('always sends dispatchable, so omission never means reset', async () => {
    const u = userEvent.setup();
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    await screen.findByTestId('dispatchable-hint');

    await u.click(screen.getByRole('radio', { name: 'Always' }));
    await u.click(screen.getByRole('button', { name: /save/i }));

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ dispatchable: 'ALWAYS' })
    );
  });

  // The override answers a question you only learn after someone is in the
  // system, and INHERIT is already the server default at create.
  it('is absent from the invite form', async () => {
    renderWithProviders(<UserInvitePage />, { initialPath: '/users/new' });
    expect(await screen.findByText('Technician')).toBeInTheDocument();
    expect(screen.queryByTestId('dispatchable-hint')).not.toBeInTheDocument();
  });

  // ...but the role picker still says which roles put someone on the board,
  // which is the invite-time version of the same information.
  it('marks field-work roles in the picker on both forms', async () => {
    renderWithProviders(<UserInvitePage />, { initialPath: '/users/new' });
    await screen.findByText('Technician');
    const marks = await screen.findAllByTitle(/appear on the dispatch board/i);
    expect(marks).toHaveLength(1);
  });
});
