import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchesApi,
  dispatchNotesApi,
  availabilityApi,
  recurringOrdersApi,
} from './schedulingApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'd-1' } });
  vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'd-1' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
  vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'n-1' } });
});

describe('dispatchesApi.listForServiceLocation', () => {
  it('always sends page and size explicitly, defaulting to 0 and 200', async () => {
    await dispatchesApi.listForServiceLocation('loc-1');

    // The server default is deliberately not relied on — history at a busy
    // commercial site is unbounded, so paging is always explicit.
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches', {
      params: {
        serviceLocationId: 'loc-1',
        when: undefined,
        q: undefined,
        status: undefined,
        from: undefined,
        to: undefined,
        page: 0,
        size: 200,
      },
    });
  });

  it('passes the caller filters and paging through', async () => {
    await dispatchesApi.listForServiceLocation('loc-1', {
      when: 'PAST',
      q: 'smith',
      status: 'COMPLETED',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 2,
      size: 25,
    } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches', {
      params: {
        serviceLocationId: 'loc-1',
        when: 'PAST',
        q: 'smith',
        status: 'COMPLETED',
        from: '2026-01-01',
        to: '2026-01-31',
        page: 2,
        size: 25,
      },
    });
  });
});

describe('dispatchesApi.listForWorkOrder', () => {
  it('returns a plain array response as-is', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'd-1' }] });

    const out = await dispatchesApi.listForWorkOrder('wo-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches', {
      params: { workOrderId: 'wo-1' },
    });
    expect(out).toEqual([{ id: 'd-1' }]);
  });

  it('unwraps a paged envelope if the endpoint ever starts paging', async () => {
    // Defensive shim — tolerate both shapes so a future paging change cannot
    // break the WO detail page.
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [{ id: 'd-2' }] } });

    const out = await dispatchesApi.listForWorkOrder('wo-1');

    expect(out).toEqual([{ id: 'd-2' }]);
  });

  it('falls back to an empty array when neither shape is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    const out = await dispatchesApi.listForWorkOrder('wo-1');

    expect(out).toEqual([]);
  });
});

describe('dispatchesApi board and CRUD', () => {
  it('getAll passes the board filters straight through', async () => {
    await dispatchesApi.getAll({ status: 'SCHEDULED', page: 1 } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches', {
      params: { status: 'SCHEDULED', page: 1 },
    });
  });

  it('getLocationTech reads the resolved technician view for a location', async () => {
    await dispatchesApi.getLocationTech('loc-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches/location-tech', {
      params: { serviceLocationId: 'loc-1' },
    });
  });

  it('covers getById, create, update and delete', async () => {
    await dispatchesApi.getById('d-1');
    await dispatchesApi.create({ workOrderId: 'wo-1' } as never);
    await dispatchesApi.update('d-1', { status: 'EN_ROUTE' } as never);
    await dispatchesApi.delete('d-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches/d-1');
    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/dispatches', {
      workOrderId: 'wo-1',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/scheduling/dispatches/d-1', {
      status: 'EN_ROUTE',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/scheduling/dispatches/d-1');
  });
});

describe('dispatchesApi.notify', () => {
  it('omits the audience param entirely when not specified', async () => {
    await dispatchesApi.notify('d-1');

    // No audience means the server's back-compat default (TECH); sending
    // audience=undefined would be a different thing on the wire.
    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notify', undefined, {
      params: undefined,
    });
  });

  it('sends the chosen audience as a query param with no body', async () => {
    await dispatchesApi.notify('d-1', 'BOTH');

    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notify', undefined, {
      params: { audience: 'BOTH' },
    });
  });
});

describe('dispatchNotesApi', () => {
  it('nests the visit-note collection under its dispatch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await dispatchNotesApi.list('d-1');
    await dispatchNotesApi.create('d-1', { body: 'Gate code 1234' });
    await dispatchNotesApi.update('d-1', 'n-1', { pinned: true });
    await dispatchNotesApi.delete('d-1', 'n-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notes');
    // Author is stamped from the JWT — never sent by the client.
    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notes', {
      body: 'Gate code 1234',
    });
    expect(apiClient.patch).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notes/n-1', {
      pinned: true,
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/scheduling/dispatches/d-1/notes/n-1');
  });
});

describe('availabilityApi', () => {
  it('covers the availability surface', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await availabilityApi.getAll({ userId: 'u-1', startDate: '2026-01-01' });
    await availabilityApi.getById('a-1');
    await availabilityApi.create({ userId: 'u-1' } as never);
    await availabilityApi.update('a-1', { status: 'APPROVED' } as never);
    await availabilityApi.delete('a-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/availability', {
      params: { userId: 'u-1', startDate: '2026-01-01' },
    });
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/availability/a-1');
    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/availability', { userId: 'u-1' });
    expect(apiClient.put).toHaveBeenCalledWith('/scheduling/availability/a-1', {
      status: 'APPROVED',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/scheduling/availability/a-1');
  });
});

describe('recurringOrdersApi', () => {
  it('covers the recurring-order surface', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await recurringOrdersApi.getAll({ customerId: 'c-1', dueBefore: '2026-02-01' });
    await recurringOrdersApi.getById('r-1');
    await recurringOrdersApi.create({ customerId: 'c-1' } as never);
    await recurringOrdersApi.update('r-1', { status: 'PAUSED' } as never);
    await recurringOrdersApi.delete('r-1');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/recurring-orders', {
      params: { customerId: 'c-1', dueBefore: '2026-02-01' },
    });
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/recurring-orders/r-1');
    expect(apiClient.post).toHaveBeenCalledWith('/scheduling/recurring-orders', {
      customerId: 'c-1',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/scheduling/recurring-orders/r-1', {
      status: 'PAUSED',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/scheduling/recurring-orders/r-1');
  });
});
