import { dispatchToRowData } from './dispatchToRowData';
import type { DispatchBoardRow } from '@dispatch/api';

const BASE: DispatchBoardRow = {
  id: 'd1',
  workOrderId: 'wo1',
  assignedUserId: 'user-1',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  arrivalWindowEnd: new Date(2026, 9, 20, 9, 0, 0).toISOString(),
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  workOrderNumber: 'WO-1001',
  workOrderTypeId: null,
  workOrderTypeName: null,
  workOrderSummary: 'No cool — compressor noise',
  customerId: 'c1',
  customerName: 'Johnson Residence',
  serviceLocationId: 'loc1',
  serviceLocationCity: 'Phoenix',
  serviceLocationState: 'AZ',
  assignedUserName: 'Mike Reynolds',
};

describe('dispatchToRowData', () => {
  it('prefers the work order summary as the title, customer + location as the subtitle', () => {
    const data = dispatchToRowData(BASE);
    expect(data.title).toBe('No cool — compressor noise');
    expect(data.subtitle).toBe('Johnson Residence · Phoenix, AZ');
    expect(data.status).toBe('SCHEDULED');
    expect(data.time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  it('falls back to the WO number when there is no summary', () => {
    const data = dispatchToRowData({ ...BASE, workOrderSummary: null });
    expect(data.title).toBe('WO-1001');
  });

  it('falls back to the customer name when there is no WO title material at all', () => {
    const data = dispatchToRowData({
      ...BASE,
      workOrderSummary: null,
      workOrderNumber: null as unknown as string,
      workOrderTypeName: null,
    });
    expect(data.title).toBe('Johnson Residence');
  });

  it('falls back to an em dash when nothing identifies the row', () => {
    const data = dispatchToRowData({
      ...BASE,
      workOrderSummary: null,
      workOrderNumber: null as unknown as string,
      workOrderTypeName: null,
      customerName: null,
    });
    expect(data.title).toBe('—');
  });

  it('does not repeat the customer name in the subtitle when it is already the title', () => {
    const data = dispatchToRowData({
      ...BASE,
      workOrderSummary: null,
      workOrderNumber: null as unknown as string,
      workOrderTypeName: null,
      serviceLocationCity: null,
      serviceLocationState: null,
    });
    expect(data.title).toBe('Johnson Residence');
    expect(data.subtitle).toBe('—');
  });

  it('omits a missing city or state rather than leaving a dangling comma', () => {
    const data = dispatchToRowData({ ...BASE, serviceLocationState: null });
    expect(data.subtitle).toBe('Johnson Residence · Phoenix');
  });

  it('falls back to an em dash subtitle when there is no customer or location info', () => {
    const data = dispatchToRowData({
      ...BASE,
      customerName: null,
      serviceLocationCity: null,
      serviceLocationState: null,
    });
    expect(data.subtitle).toBe('—');
  });
});
