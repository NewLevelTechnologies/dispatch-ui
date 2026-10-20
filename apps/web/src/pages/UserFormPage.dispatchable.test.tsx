import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { UserEditPage, UserInvitePage } from './UserFormPage';
import { summarizeAssignment } from '../lib/dispatchable';

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
  // Outcome in the option label, cause in the line beneath — so the person
  // choosing sees what they'd be overriding without reading elsewhere.
  it('echoes the inherited outcome in the label and the cause beneath', async () => {
    mockGetById.mockResolvedValue(user({ roles: [TECH] }));
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });

    expect(await screen.findByTestId('dispatchable-hint')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Follow roles — assignable/ })).toBeInTheDocument();
    expect(hint()).toContain('Technician');
  });

  it('says why someone is not assignable under INHERIT', async () => {
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    expect(await screen.findByTestId('dispatchable-hint')).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Follow roles — not assignable/ })
    ).toBeInTheDocument();
    expect(hint()).toContain('No role here performs field work');
  });

  // Live against the form, not the saved value: ticking Technician should
  // answer the question immediately.
  it('updates live as roles change, before saving', async () => {
    const u = userEvent.setup();
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    await screen.findByTestId('dispatchable-hint');
    expect(
      screen.getByRole('radio', { name: /Follow roles — not assignable/ })
    ).toBeInTheDocument();

    // jsdom doesn't forward a <label> click to Headless's role=checkbox span
    // the way a real browser does, so target the control inside the row.
    const row = screen.getByText('Technician').closest('label') as HTMLElement;
    await u.click(row.querySelector('[role="checkbox"]') as HTMLElement);

    expect(screen.getByRole('radio', { name: /Follow roles — assignable/ })).toBeInTheDocument();
    expect(hint()).toContain('Technician');
  });

  it('reports the override as overriding, in both directions', async () => {
    const u = userEvent.setup();
    mockGetById.mockResolvedValue(user({ roles: [TECH] }));
    renderWithProviders(<UserEditPage />, { initialPath: '/users/u1/edit' });
    await screen.findByTestId('dispatchable-hint');

    await u.click(screen.getByRole('radio', { name: 'Never' }));
    expect(hint()).toContain('Overrides the Technician role');

    await u.click(screen.getByRole('radio', { name: 'Always' }));
    expect(hint()).toContain('already qualifies');
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

// ── Read surface ───────────────────────────────────────────────────
// The form is where you SET it; the detail page is where anyone goes to ask
// "can this person be given work?", so it has to answer without a round trip
// through the edit screen.
const say = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('Assignment summary on user detail', () => {
  it('answers assignable and names the role under INHERIT', () => {
    const r = summarizeAssignment({
      dispatchable: 'INHERIT',
      performsFieldWork: true,
      roles: [TECH],
    });
    expect(r.assignable).toBe(true);
    expect(say(r.reason)).toBe('From the Technician role');
    // Nothing about the override while inheriting — most users inherit, and
    // for them the field should read as though it doesn't exist.
    expect(r.override).toBeNull();
  });

  it('says why someone is not assignable under INHERIT', () => {
    const r = summarizeAssignment({
      dispatchable: 'INHERIT',
      performsFieldWork: false,
      roles: [CSR],
    });
    expect(r.assignable).toBe(false);
    expect(say(r.reason)).toBe('No role here performs field work');
  });

  // The loud case: this is how a technician silently vanishes from the board
  // with nobody able to explain why.
  it('shouts when NEVER contradicts a qualifying role', () => {
    const r = summarizeAssignment({
      dispatchable: 'NEVER',
      performsFieldWork: false,
      roles: [TECH],
    });
    expect(r.override).toBe('warning');
    expect(say(r.reason)).toBe('Overrides the Technician role');
  });

  it('stays quiet when NEVER contradicts nothing', () => {
    const r = summarizeAssignment({
      dispatchable: 'NEVER',
      performsFieldWork: false,
      roles: [CSR],
    });
    expect(r.override).toBe('neutral');
    // The override is redundant here — they'd be off the board anyway — so the
    // line states the cause rather than restating the badge.
    expect(say(r.reason)).toBe('No role here performs field work');
  });

  // A redundant ALWAYS is worth saying quietly: it tells an admin the
  // override is doing nothing, so removing a role won't behave as expected.
  it('flags a redundant ALWAYS', () => {
    const r = summarizeAssignment({
      dispatchable: 'ALWAYS',
      performsFieldWork: true,
      roles: [TECH],
    });
    expect(say(r.reason)).toContain('The Technician role already qualifies');
  });

  it('explains a load-bearing ALWAYS', () => {
    const r = summarizeAssignment({
      dispatchable: 'ALWAYS',
      performsFieldWork: true,
      roles: [CSR],
    });
    expect(say(r.reason)).toContain('No role here performs field work');
  });

  // Regions NARROW, they don't exclude: scheduling-service applies a region
  // condition only when a filter is set, so a tech with no assignments still
  // appears on the unfiltered board. There is deliberately no warning here —
  // one would push admins to assign regions in single-region tenants that
  // have no use for them.
  it('says nothing about regions, which narrow rather than exclude', () => {
    const r = summarizeAssignment({
      dispatchable: 'INHERIT',
      performsFieldWork: true,
      roles: [TECH],
    });
    expect(r.assignable).toBe(true);
    expect(say(r.reason)).toBe('From the Technician role');
    expect('noRegions' in r).toBe(false);
  });

  // Nested roles don't always carry the flag. Better vague than printing a
  // cause that contradicts the pill beside it.
  it('stays vague rather than contradicting the resolved answer', () => {
    const r = summarizeAssignment({
      dispatchable: 'INHERIT',
      performsFieldWork: true,
      roles: [{ ...TECH, performsFieldWork: undefined }],
    });
    expect(say(r.reason)).toBe('From their roles');
  });
});
