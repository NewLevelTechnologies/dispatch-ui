import { boardDispatchToRowData } from './boardDispatchToRowData';
import type { BoardDispatch } from '@dispatch/api';

const BASE: BoardDispatch = {
  id: 'd1',
  seq: 1,
  status: 'SCHEDULED',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  arrivalWindowEnd: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
  estimatedDuration: 120,
  releasedAt: '2026-10-16T00:00:00.000Z',
  releaseState: 'RELEASED',
  released: null,
  divisionId: null,
  version: 1,
  windowChangedAt: null,
  assignedUserId: 'user-1',
  assignedUserName: 'Jake Morrison',
  workOrderId: 'wo1',
  workOrderNumber: 'WO-00138',
  workOrderTypeId: 'type-1',
  workOrderSummary: 'No hot water, pilot will not stay lit',
  customerId: 'c1',
  customerName: 'Michelle Parker',
  priority: null,
  recurring: false,
  serviceLocationId: 'loc1',
  serviceLocationName: null,
  serviceLocationStreet: '123 Main St',
  serviceLocationCity: 'Phoenix',
  serviceLocationState: 'AZ',
  serviceLocationZip: '85001',
  latitude: null,
  longitude: null,
  driveMinFromPrev: null,
  arrivedAt: null,
  departedAt: null,
  addressedWorkItemIds: [],
};

describe('boardDispatchToRowData', () => {
  it('prefers the WO summary as title, customer + location as subtitle', () => {
    const data = boardDispatchToRowData(BASE);
    expect(data.title).toBe('No hot water, pilot will not stay lit');
    expect(data.subtitle).toBe('Michelle Parker · Phoenix, AZ');
    expect(data.status).toBe('SCHEDULED');
    expect(data.time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  it('prefers a named service location over the customer name', () => {
    const data = boardDispatchToRowData({ ...BASE, serviceLocationName: 'Downtown Office' });
    expect(data.subtitle).toBe('Downtown Office · Phoenix, AZ');
  });

  it('falls back to the WO number when there is no summary', () => {
    const data = boardDispatchToRowData({ ...BASE, workOrderSummary: null });
    expect(data.title).toBe('WO-00138');
  });

  it('falls back to the customer name when there is no WO title material at all', () => {
    const data = boardDispatchToRowData({ ...BASE, workOrderSummary: null, workOrderNumber: null });
    expect(data.title).toBe('Michelle Parker');
  });

  it('falls back to an em dash when nothing identifies the row', () => {
    const data = boardDispatchToRowData({
      ...BASE,
      workOrderSummary: null,
      workOrderNumber: null,
      customerName: null,
    });
    expect(data.title).toBe('—');
  });

  it('does not repeat the place in the subtitle when it is already the title', () => {
    const data = boardDispatchToRowData({
      ...BASE,
      workOrderSummary: null,
      workOrderNumber: null,
      serviceLocationCity: null,
      serviceLocationState: null,
    });
    expect(data.title).toBe('Michelle Parker');
    expect(data.subtitle).toBe('—');
  });

  it('falls back to an em dash subtitle when there is no place or location info', () => {
    const data = boardDispatchToRowData({
      ...BASE,
      customerName: null,
      serviceLocationCity: null,
      serviceLocationState: null,
    });
    expect(data.subtitle).toBe('—');
  });
});
