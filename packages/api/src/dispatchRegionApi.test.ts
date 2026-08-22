import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchRegionApi } from './dispatchRegionApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'r-1' } });
  vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'r-1' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
});

describe('dispatchRegionApi.getAll', () => {
  it('omits the query string entirely when only active regions are wanted', async () => {
    await dispatchRegionApi.getAll();

    // This endpoint builds the query into the path rather than using params,
    // so the default must not leave a bare "?includeInactive=false".
    expect(apiClient.get).toHaveBeenCalledWith('/tenant/dispatch-regions');
  });

  it('appends includeInactive=true when deactivated regions are wanted', async () => {
    await dispatchRegionApi.getAll(true);

    expect(apiClient.get).toHaveBeenCalledWith('/tenant/dispatch-regions?includeInactive=true');
  });
});

describe('dispatchRegionApi', () => {
  it('getDefault reads the dedicated default route', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    // null is a valid answer — it means several active regions exist, so
    // there is no single default.
    const out = await dispatchRegionApi.getDefault();

    expect(apiClient.get).toHaveBeenCalledWith('/tenant/dispatch-regions/default');
    expect(out).toBeNull();
  });

  it('covers getById, create, update and delete', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'r-1' } });

    await dispatchRegionApi.getById('r-1');
    await dispatchRegionApi.create({ name: 'North', abbreviation: 'N' } as never);
    await dispatchRegionApi.update('r-1', { name: 'North East' } as never);
    await dispatchRegionApi.delete('r-1');

    expect(apiClient.get).toHaveBeenCalledWith('/tenant/dispatch-regions/r-1');
    expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions', {
      name: 'North',
      abbreviation: 'N',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/tenant/dispatch-regions/r-1', {
      name: 'North East',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/tenant/dispatch-regions/r-1');
  });

  it('reactivate posts with no body and reorder wraps the ids', async () => {
    await dispatchRegionApi.reactivate('r-1');
    await dispatchRegionApi.reorder(['r-2', 'r-1']);

    // delete deactivates; reactivate is the inverse, not a re-create.
    expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions/r-1/reactivate');
    expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions/reorder', {
      orderedIds: ['r-2', 'r-1'],
    });
  });
});
