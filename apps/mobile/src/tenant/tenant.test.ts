import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TenantMembership } from '../api/setup';
import {
  clearStoredTenant,
  getActiveTenantId,
  persistTenantId,
  resolveActiveTenant,
  setActiveTenantId,
  storedTenantId,
} from './tenant';

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

describe('resolveActiveTenant', () => {
  it('resolves to "none" with no memberships', () => {
    expect(resolveActiveTenant([], null)).toEqual({ kind: 'none' });
  });

  it('resolves the single membership without a picker, even with a stale stored id', () => {
    expect(resolveActiveTenant([ACME], 'some-other-id')).toEqual({
      kind: 'resolved',
      membership: ACME,
      source: 'only',
    });
  });

  it('resolves the stored membership when it is still a valid one', () => {
    expect(resolveActiveTenant([ACME, GLOBEX], 'globex-id')).toEqual({
      kind: 'resolved',
      membership: GLOBEX,
      source: 'stored',
    });
  });

  it('falls through to the picker when the stored id no longer matches a membership', () => {
    // A revoked membership must not resurrect a dead choice.
    expect(resolveActiveTenant([ACME, GLOBEX], 'revoked-id')).toEqual({ kind: 'picker' });
  });

  it('shows the picker when there are multiple memberships and nothing stored', () => {
    expect(resolveActiveTenant([ACME, GLOBEX], null)).toEqual({ kind: 'picker' });
  });
});

describe('getActiveTenantId / setActiveTenantId', () => {
  it('starts null and reflects the last value set', () => {
    setActiveTenantId('acme-id');
    expect(getActiveTenantId()).toBe('acme-id');
    setActiveTenantId(null);
    expect(getActiveTenantId()).toBeNull();
  });
});

describe('storage helpers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('round-trips a stored tenant id', async () => {
    await persistTenantId('acme-id');
    expect(await storedTenantId()).toBe('acme-id');
  });

  it('clears the stored tenant id', async () => {
    await persistTenantId('acme-id');
    await clearStoredTenant();
    expect(await storedTenantId()).toBeNull();
  });

  it('degrades to null rather than throwing when storage is unavailable', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('blocked'));
    expect(await storedTenantId()).toBeNull();
  });

  it('does not throw when a write fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('blocked'));
    await expect(persistTenantId('acme-id')).resolves.toBeUndefined();
  });
});
