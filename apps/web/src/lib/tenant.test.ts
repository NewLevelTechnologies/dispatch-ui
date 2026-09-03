import { describe, it, expect, beforeEach } from 'vitest';
import {
  slugFromHost,
  resolveActiveTenant,
  storedTenantId,
  persistTenantId,
  clearStoredTenant,
  setActiveTenantId,
  getActiveTenantId,
} from './tenant';
import type { TenantMembership } from '@dispatch/api';

const BASE = 'dev.dispatch.example.net';

function membership(over: Partial<TenantMembership> = {}): TenantMembership {
  return {
    tenantId: 'tenant-acme',
    tenantSlug: 'acme-hvac',
    companyName: 'ACME HVAC Services',
    userId: 'membership-1',
    ...over,
  };
}

const ACME = membership();
const GLOBEX = membership({
  tenantId: 'tenant-globex',
  tenantSlug: 'globex-facilities',
  companyName: 'Globex Facilities',
  userId: 'membership-2',
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setActiveTenantId(null);
});

describe('slugFromHost', () => {
  it('returns null when no base domain is configured', () => {
    // The state until subdomains ship: the app resolves from storage only.
    expect(slugFromHost('acme-hvac.dev.dispatch.example.net', undefined)).toBeNull();
  });

  it('returns null on the bare apex', () => {
    expect(slugFromHost(BASE, BASE)).toBeNull();
  });

  it('reads the leading label as the slug', () => {
    expect(slugFromHost(`acme-hvac.${BASE}`, BASE)).toBe('acme-hvac');
  });

  it('lowercases the slug', () => {
    expect(slugFromHost(`ACME-HVAC.${BASE}`, BASE)).toBe('acme-hvac');
  });

  it('ignores a host that merely ends with the base domain', () => {
    // Guards against `evil-dev.dispatch.example.net` style lookalikes: the
    // suffix has to be a real label boundary, not a substring match.
    expect(slugFromHost('evildev.dispatch.example.net', BASE)).toBeNull();
  });

  it('refuses a multi-label prefix rather than guessing which part is the slug', () => {
    expect(slugFromHost(`a.b.${BASE}`, BASE)).toBeNull();
  });
});

describe('storage tiers', () => {
  it('prefers the per-tab session value over the fresh-tab seed', () => {
    localStorage.setItem('dispatch.defaultTenantId', 'tenant-globex');
    sessionStorage.setItem('dispatch.activeTenantId', 'tenant-acme');
    expect(storedTenantId()).toBe('tenant-acme');
  });

  it('falls back to the seed when the tab has no session value', () => {
    localStorage.setItem('dispatch.defaultTenantId', 'tenant-globex');
    expect(storedTenantId()).toBe('tenant-globex');
  });

  it('persists to both tiers so a fresh tab inherits the choice', () => {
    persistTenantId('tenant-acme');
    expect(sessionStorage.getItem('dispatch.activeTenantId')).toBe('tenant-acme');
    expect(localStorage.getItem('dispatch.defaultTenantId')).toBe('tenant-acme');
  });

  it('clears both tiers', () => {
    persistTenantId('tenant-acme');
    clearStoredTenant();
    expect(storedTenantId()).toBeNull();
  });
});

describe('active tenant holder', () => {
  it('sends nothing until bootstrap validates a choice', () => {
    // Storage alone must not produce a header — the interceptor should only see
    // a tenant confirmed against the membership list.
    persistTenantId('tenant-acme');
    expect(getActiveTenantId()).toBeNull();
  });

  it('returns the tenant once set', () => {
    setActiveTenantId('tenant-acme');
    expect(getActiveTenantId()).toBe('tenant-acme');
  });
});

describe('resolveActiveTenant', () => {
  it('reports none when the person belongs to no workspace', () => {
    expect(resolveActiveTenant([])).toEqual({ kind: 'none' });
  });

  it('selects a single membership silently rather than showing a picker', () => {
    expect(resolveActiveTenant([ACME])).toEqual({
      kind: 'resolved',
      membership: ACME,
      source: 'only',
    });
  });

  it('honours a stored choice so the picker stays a fallback, not a daily gate', () => {
    persistTenantId('tenant-globex');
    expect(resolveActiveTenant([ACME, GLOBEX])).toEqual({
      kind: 'resolved',
      membership: GLOBEX,
      source: 'stored',
    });
  });

  it('falls through to the picker when the stored choice was revoked', () => {
    persistTenantId('tenant-gone');
    expect(resolveActiveTenant([ACME, GLOBEX])).toEqual({ kind: 'picker' });
  });

  it('shows the picker when several workspaces and nothing stored', () => {
    expect(resolveActiveTenant([ACME, GLOBEX])).toEqual({ kind: 'picker' });
  });

  it('lets the host outrank a conflicting stored choice', () => {
    // Following a link to globex.… means Globex, whatever this tab did last.
    persistTenantId('tenant-acme');
    const result = resolveActiveTenant([ACME, GLOBEX], `globex-facilities.${BASE}`, BASE);
    expect(result).toEqual({ kind: 'resolved', membership: GLOBEX, source: 'host' });
  });

  it('distinguishes an unknown workspace from having none', () => {
    // Distinct remedies: "you are not in THIS workspace, here are yours" vs
    // "you are not in any workspace at all".
    const result = resolveActiveTenant([ACME], `northwind.${BASE}`, BASE);
    expect(result).toEqual({ kind: 'unknown-workspace', slug: 'northwind' });
  });

  it('reports an unknown workspace even when the person has no memberships', () => {
    const result = resolveActiveTenant([], `northwind.${BASE}`, BASE);
    expect(result).toEqual({ kind: 'unknown-workspace', slug: 'northwind' });
  });
});
