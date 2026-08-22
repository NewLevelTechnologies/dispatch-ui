import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customerApi } from './customerApi';
import apiClient from './client';

vi.mock('./client');

describe('customerApi.getPayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 0, totalPages: 0 } });
  });

  it('GETs /customers/payers converting the 1-indexed UI page to 0-indexed and omits sort by default', async () => {
    await customerApi.getPayers({ page: 2, size: 50, search: 'acme' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 1, size: 50, search: 'acme' },
    });
  });

  it('defaults page to 0 and passes sort through when provided', async () => {
    await customerApi.getPayers({ sort: 'lifetimePaid,desc' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 0, sort: 'lifetimePaid,desc' },
    });
  });

  it('renames the boolean triage filters and joins tag ids', async () => {
    await customerApi.getPayers({
      hasOpenBalance: true,
      hasAgedBalance: true,
      tagIds: ['t-1', 't-2'],
    });

    // hasOpenBalance/hasAgedBalance are the UI names; the wire wants
    // openBalance/agedBalance, and tagIds becomes a comma-joined `tags`.
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 0, openBalance: true, agedBalance: true, tags: 't-1,t-2' },
    });
  });

  it('omits false booleans and empty tag arrays entirely', async () => {
    await customerApi.getPayers({ hasOpenBalance: false, tagIds: [] });

    // `false || undefined` collapses to undefined and is then stripped, so an
    // unchecked chip sends nothing rather than openBalance=false.
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', { params: { page: 0 } });
  });
});

describe('customerApi.getAllPaginated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
  });

  it('converts the 1-indexed UI page and joins multi-value status', async () => {
    await customerApi.getAllPaginated({
      page: 3,
      size: 25,
      status: ['ACTIVE', 'INACTIVE'],
      search: 'acme',
      sort: 'name,desc',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/customers', {
      params: { page: 2, size: 25, status: 'ACTIVE,INACTIVE', search: 'acme', sort: 'name,desc' },
    });
  });

  it('maps the three job/balance filters to their wire names', async () => {
    await customerApi.getAllPaginated({
      hasOpenBalance: true,
      hasAgedBalance: true,
      hasOpenJobs: true,
      tagIds: ['t-9'],
    });

    expect(apiClient.get).toHaveBeenCalledWith('/customers', {
      params: { page: 0, openBalance: true, agedBalance: true, openJobs: true, tags: 't-9' },
    });
  });

  it('sends only the default page when called with nothing', async () => {
    await customerApi.getAllPaginated();

    expect(apiClient.get).toHaveBeenCalledWith('/customers', { params: { page: 0 } });
  });

  it('drops an empty status array rather than sending status=', async () => {
    await customerApi.getAllPaginated({ status: [], search: '' });

    expect(apiClient.get).toHaveBeenCalledWith('/customers', { params: { page: 0 } });
  });
});

describe('customerApi customer CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'c-1' } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'c-1' } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'c-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
  });

  it('covers getById, create, update, delete and the billing-address route', async () => {
    await customerApi.getById('c-1');
    await customerApi.create({ name: 'Acme' } as never);
    await customerApi.update('c-1', { name: 'Acme 2' } as never);
    await customerApi.updateBillingAddress('c-1', { street: '1 Main St' } as never);
    await customerApi.delete('c-1');

    expect(apiClient.get).toHaveBeenCalledWith('/customers/c-1');
    expect(apiClient.post).toHaveBeenCalledWith('/customers', { name: 'Acme' });
    // customers use PUT for update, unlike the equipment endpoints' PATCH
    expect(apiClient.put).toHaveBeenCalledWith('/customers/c-1', { name: 'Acme 2' });
    expect(apiClient.put).toHaveBeenCalledWith('/customers/c-1/billing-address', {
      street: '1 Main St',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/customers/c-1');
  });

  it('verifyAddress geocode-previews without saving', async () => {
    await customerApi.verifyAddress({ street: '1 Main St', city: 'Austin' } as never);

    expect(apiClient.post).toHaveBeenCalledWith('/customers/addresses/verify', {
      street: '1 Main St',
      city: 'Austin',
    });
  });
});

describe('customerApi service locations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'loc-1' } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'loc-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
  });

  it('nests list and create under the customer', async () => {
    await customerApi.getServiceLocations('c-1');
    await customerApi.addServiceLocation('c-1', { street: '2 Oak' } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/customers/c-1/service-locations');
    expect(apiClient.post).toHaveBeenCalledWith('/customers/c-1/service-locations', {
      street: '2 Oak',
    });
  });

  it('uses the standalone location routes for update, address, close and delete', async () => {
    await customerApi.updateServiceLocation('loc-1', { nickname: 'Rooftop' } as never);
    await customerApi.updateServiceLocationAddress('loc-1', { street: '3 Elm' } as never);
    await customerApi.closeServiceLocation('loc-1');
    await customerApi.deleteServiceLocation('loc-1');

    // No customerId in the path — these are addressable on their own.
    expect(apiClient.put).toHaveBeenCalledWith('/service-locations/loc-1', {
      nickname: 'Rooftop',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/service-locations/loc-1/address', {
      street: '3 Elm',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/loc-1/close');
    expect(apiClient.delete).toHaveBeenCalledWith('/service-locations/loc-1');
  });

  it('getServiceLocationById reads the full detail projection', async () => {
    await customerApi.getServiceLocationById('loc-1');

    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/loc-1');
  });

  it('getAllServiceLocationsPaginated maps its filters onto the wire names', async () => {
    await customerApi.getAllServiceLocationsPaginated({
      page: 2,
      status: ['ACTIVE', 'CLOSED'],
      dispatchRegionId: 'r-1',
      live: true,
      hasOpenJobs: true,
      pmOverdue: true,
      premise: 'business',
      tagIds: ['t-1'],
    });

    expect(apiClient.get).toHaveBeenCalledWith('/service-locations', {
      params: {
        page: 1,
        status: 'ACTIVE,CLOSED',
        dispatchRegionId: 'r-1',
        live: true,
        openJobs: true,
        pmOverdue: true,
        premise: 'business',
        tags: 't-1',
      },
    });
  });

  it('getAllServiceLocationsPaginated strips falsey filters and empty arrays', async () => {
    await customerApi.getAllServiceLocationsPaginated({
      live: false,
      hasOpenJobs: false,
      pmOverdue: false,
      status: [],
      tagIds: [],
      dispatchRegionId: '',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/service-locations', { params: { page: 0 } });
  });
});

describe('customerApi search helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
  });

  it('search passes the picker params through untouched', async () => {
    // Note: unlike the list endpoints, search page is already 0-indexed.
    await customerApi.search({ q: 'acme', page: 1, size: 10, sort: 'name' });

    expect(apiClient.get).toHaveBeenCalledWith('/customers/search', {
      params: { q: 'acme', page: 1, size: 10, sort: 'name' },
    });
  });

  it('duplicateCheck forwards whichever address parts it was given', async () => {
    await customerApi.duplicateCheck({ name: 'Acme', street: '1 Main St' });

    expect(apiClient.get).toHaveBeenCalledWith('/customers/duplicate-check', {
      params: { name: 'Acme', street: '1 Main St' },
    });
  });

  it('searchPayers is name-only and scoped to the payers route', async () => {
    await customerApi.searchPayers('acme');

    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers/search', {
      params: { q: 'acme' },
    });
  });

  it('searchServiceLocations defaults page 0 and size 50', async () => {
    await customerApi.searchServiceLocations('oak');
    expect(apiClient.get).toHaveBeenLastCalledWith('/service-locations/search', {
      params: { q: 'oak', page: 0, size: 50 },
    });

    await customerApi.searchServiceLocations('oak', 2, 10);
    expect(apiClient.get).toHaveBeenLastCalledWith('/service-locations/search', {
      params: { q: 'oak', page: 2, size: 10 },
    });
  });

  it('getRecentServiceLocations backs the picker zero-state with a fixed page 0', async () => {
    await customerApi.getRecentServiceLocations();
    expect(apiClient.get).toHaveBeenLastCalledWith('/service-locations/recent', {
      params: { page: 0, size: 8 },
    });

    // Recency order is server-side, so this takes size only — never a sort.
    await customerApi.getRecentServiceLocations(20);
    expect(apiClient.get).toHaveBeenLastCalledWith('/service-locations/recent', {
      params: { page: 0, size: 20 },
    });
  });
});
