import { describe, it, expect } from 'vitest';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { ApiClient } from './client';

// Drives the real request interceptor rather than mocking the client away: the
// thing worth testing here IS the interceptor, since a dropped `X-Tenant-Id`
// resolves silently against the legacy JWT claim instead of failing loudly.
function capturing(): {
  config: AxiosRequestConfig;
  seen: () => InternalAxiosRequestConfig | undefined;
} {
  let captured: InternalAxiosRequestConfig | undefined;
  return {
    config: {
      adapter: async (config: InternalAxiosRequestConfig) => {
        captured = config;
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
      },
    },
    seen: () => captured,
  };
}

function clientWithTenant(tenantId: string | null): ApiClient {
  const client = new ApiClient('https://api.test/api/v1');
  client.setTenantProvider({ getActiveTenantId: () => tenantId });
  return client;
}

describe('X-Tenant-Id request header', () => {
  it('names the active tenant on an ordinary call', async () => {
    const cap = capturing();
    await clientWithTenant('tenant-acme').get('/work-orders', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBe('tenant-acme');
  });

  it('sends no header before a tenant has been resolved', async () => {
    // Mid-rollout this is the correct behaviour: the backend falls back to the
    // legacy `custom:tenant_id` claim when the header is absent.
    const cap = capturing();
    await clientWithTenant(null).get('/work-orders', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBeUndefined();
  });

  it('sends no header when no tenant provider is installed at all', async () => {
    const cap = capturing();
    await new ApiClient('https://api.test/api/v1').get('/work-orders', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBeUndefined();
  });

  it('attaches the header to writes, not just reads', async () => {
    const cap = capturing();
    await clientWithTenant('tenant-acme').post('/work-orders', { title: 'x' }, cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBe('tenant-acme');
  });

  it('omits the header on the bootstrap call', async () => {
    // `/users/me/tenants` runs before a tenant is chosen — it is the call that
    // answers which workspaces exist, so naming one would be meaningless.
    const cap = capturing();
    await clientWithTenant('tenant-acme').get('/users/me/tenants', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBeUndefined();
  });

  it('still sends the header on the neighbouring /users/me call', async () => {
    // Guards the exclusion against being matched too loosely: /users/me IS
    // tenant-scoped and returns the membership-specific profile.
    const cap = capturing();
    await clientWithTenant('tenant-acme').get('/users/me', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBe('tenant-acme');
  });

  it('omits the header on the bootstrap call carrying a query string', async () => {
    const cap = capturing();
    await clientWithTenant('tenant-acme').get('/users/me/tenants?refresh=1', cap.config);
    expect(cap.seen()?.headers['X-Tenant-Id']).toBeUndefined();
  });

  it('leaves the auth header to the auth provider', async () => {
    const client = clientWithTenant('tenant-acme');
    client.setAuthProvider({ getAccessToken: async () => 'jwt-token' });
    const cap = capturing();
    await client.get('/work-orders', cap.config);
    expect(cap.seen()?.headers.Authorization).toBe('Bearer jwt-token');
    expect(cap.seen()?.headers['X-Tenant-Id']).toBe('tenant-acme');
  });
});
