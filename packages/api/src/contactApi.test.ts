import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactApi } from './contactApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'ct-1' } });
  vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'ct-1' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
});

describe('contactApi customer contacts', () => {
  it('covers the customer-scoped contact CRUD', async () => {
    await contactApi.getCustomerContacts('c-1');
    await contactApi.getCustomerContact('c-1', 'ct-1');
    await contactApi.createCustomerContact('c-1', { firstName: 'Dana' } as never);
    await contactApi.updateCustomerContact('c-1', 'ct-1', { firstName: 'Dane' } as never);
    await contactApi.deleteCustomerContact('c-1', 'ct-1');

    expect(apiClient.get).toHaveBeenCalledWith('/customers/c-1/contacts');
    expect(apiClient.get).toHaveBeenCalledWith('/customers/c-1/contacts/ct-1');
    expect(apiClient.post).toHaveBeenCalledWith('/customers/c-1/contacts', { firstName: 'Dana' });
    expect(apiClient.put).toHaveBeenCalledWith('/customers/c-1/contacts/ct-1', {
      firstName: 'Dane',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/customers/c-1/contacts/ct-1');
  });

  it('promotes a contact to primary in one call, with no body', async () => {
    // The server demotes the existing primary — the client must not attempt a
    // two-call swap of its own.
    await contactApi.makeCustomerContactPrimary('c-1', 'ct-2');

    expect(apiClient.post).toHaveBeenCalledWith('/customers/c-1/contacts/ct-2/make-primary');
  });
});

describe('contactApi service-location contacts', () => {
  it('covers the location-scoped contact CRUD', async () => {
    await contactApi.getServiceLocationContacts('loc-1');
    await contactApi.getServiceLocationContact('loc-1', 'ct-1');
    await contactApi.createServiceLocationContact('loc-1', { firstName: 'Sam' } as never);
    await contactApi.updateServiceLocationContact('loc-1', 'ct-1', { firstName: 'Sammy' } as never);
    await contactApi.deleteServiceLocationContact('loc-1', 'ct-1');

    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/loc-1/contacts');
    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/loc-1/contacts/ct-1');
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/loc-1/contacts', {
      firstName: 'Sam',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/service-locations/loc-1/contacts/ct-1', {
      firstName: 'Sammy',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/service-locations/loc-1/contacts/ct-1');
  });

  it('mirrors the customer make-primary behaviour on locations', async () => {
    await contactApi.makeServiceLocationContactPrimary('loc-1', 'ct-2');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-locations/loc-1/contacts/ct-2/make-primary'
    );
  });
});

describe('contactApi.getContactById', () => {
  it('reads a contact from the flat route without an owner scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'ct-1' } });

    const out = await contactApi.getContactById('ct-1');

    expect(apiClient.get).toHaveBeenCalledWith('/contacts/ct-1');
    expect(out).toEqual({ id: 'ct-1' });
  });
});
