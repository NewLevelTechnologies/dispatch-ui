import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agreementApi, agreementNotesApi } from './agreementApi';
import apiClient from './client';

vi.mock('./client');

describe('agreementApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
  });

  it('list defaults classification to CONTRACT and strips undefined customerId', async () => {
    await agreementApi.list();
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements', {
      params: { classification: 'CONTRACT' },
    });
  });

  it('list scopes to a customer and keeps the default classification', async () => {
    await agreementApi.list({ customerId: 'c-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements', {
      params: { classification: 'CONTRACT', customerId: 'c-1' },
    });
  });

  it('list passes an explicit classification', async () => {
    await agreementApi.list({ classification: 'INTERNAL' });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements', {
      params: { classification: 'INTERNAL' },
    });
  });

  it('list passes serviceLocationId for the reverse lookup', async () => {
    await agreementApi.list({ serviceLocationId: 'sl-9' });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements', {
      params: { classification: 'CONTRACT', serviceLocationId: 'sl-9' },
    });
  });

  it('getById hits /work-orders/agreements/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { id: 'a-1' } });
    const result = await agreementApi.getById('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1');
    expect(result).toEqual({ id: 'a-1' });
  });

  it('update PATCHes the agreement with the request body', async () => {
    await agreementApi.update('a-1', { autoRenew: false, notes: null });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/agreements/a-1', {
      autoRenew: false,
      notes: null,
    });
  });

  it('cancel POSTs to /cancel', async () => {
    await agreementApi.cancel('a-1');
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/cancel');
  });

  it('getCoverage hits /coverage', async () => {
    await agreementApi.getCoverage('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/coverage');
  });

  it('getVisits defaults to when=upcoming, limit=20', async () => {
    await agreementApi.getVisits('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/visits', {
      params: { when: 'upcoming', limit: 20 },
    });
  });

  it('getVisits passes when + limit', async () => {
    await agreementApi.getVisits('a-1', { when: 'recent', limit: 5 });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/visits', {
      params: { when: 'recent', limit: 5 },
    });
  });

  it('getCompliance hits /compliance', async () => {
    await agreementApi.getCompliance('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/compliance');
  });

  it('getBillingSchedule hits /billing-schedule', async () => {
    await agreementApi.getBillingSchedule('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/billing-schedule');
  });

  it('upsertBillingSchedule PUTs the schedule to /billing-schedule', async () => {
    const body = {
      amount: 300,
      cadenceUnit: 'QUARTER' as const,
      cadenceInterval: 1,
      anchorDate: '2026-07-01',
      netDays: 30,
      billingMode: 'FIXED_SCHEDULE' as const,
      active: true,
    };
    await agreementApi.upsertBillingSchedule('a-1', body);
    expect(apiClient.put).toHaveBeenCalledWith('/work-orders/agreements/a-1/billing-schedule', body);
  });

  it('getInstallments hits /billing-schedule/installments', async () => {
    await agreementApi.getInstallments('a-1');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/work-orders/agreements/a-1/billing-schedule/installments',
    );
  });

  describe('agreementNotesApi', () => {
    it('list GETs the agreement notes', async () => {
      await agreementNotesApi.list('a-1');
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/notes');
    });
    it('create POSTs a note', async () => {
      await agreementNotesApi.create('a-1', { body: 'Renewal called', pinned: true });
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/notes', {
        body: 'Renewal called',
        pinned: true,
      });
    });
    it('update PATCHes a note', async () => {
      await agreementNotesApi.update('a-1', 'n-1', { pinned: false });
      expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/agreements/a-1/notes/n-1', {
        pinned: false,
      });
    });
    it('delete DELETEs a note', async () => {
      await agreementNotesApi.delete('a-1', 'n-1');
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/agreements/a-1/notes/n-1');
    });
  });

  it('create POSTs to /work-orders/agreements', async () => {
    const body = { customerId: 'c-1', name: 'Q PM', kind: 'VISIT' as const, classification: 'CONTRACT' as const };
    await agreementApi.create(body);
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements', body);
  });

  it('createVisitTemplate POSTs under /visit-templates', async () => {
    const body = { label: 'Summer PM', cadenceUnit: 'QUARTER' as const, anchorDate: '2026-07-01' };
    await agreementApi.createVisitTemplate('a-1', body);
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/visit-templates', body);
  });

  it('updateVisitTemplate PATCHes a specific template', async () => {
    await agreementApi.updateVisitTemplate('a-1', 't-1', { label: 'Renamed' });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/agreements/a-1/visit-templates/t-1', {
      label: 'Renamed',
    });
  });

  it('deleteVisitTemplate DELETEs a specific template', async () => {
    await agreementApi.deleteVisitTemplate('a-1', 't-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/agreements/a-1/visit-templates/t-1');
  });

  it('updateCoverageSelector PUTs /coverage/selector', async () => {
    await agreementApi.updateCoverageSelector('a-1', { selectorMode: 'STATIC', autoAdd: false });
    expect(apiClient.put).toHaveBeenCalledWith('/work-orders/agreements/a-1/coverage/selector', {
      selectorMode: 'STATIC',
      autoAdd: false,
    });
  });

  it('addCoverageLocations POSTs /coverage/locations', async () => {
    await agreementApi.addCoverageLocations('a-1', { serviceLocationIds: ['sl-1', 'sl-2'] });
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/coverage/locations', {
      serviceLocationIds: ['sl-1', 'sl-2'],
    });
  });

  it('removeCoverageLocation DELETEs a specific location', async () => {
    await agreementApi.removeCoverageLocation('a-1', 'sl-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/agreements/a-1/coverage/locations/sl-1');
  });

  it('getCustomerSummary GETs the per-customer rollup (AG-1)', async () => {
    const summary = {
      arr: 2400, activeAgreementCount: 2, coveredLocations: 3,
      totalLocations: 4, coveragePct: 75, overdueVisitCount: 3, currency: 'USD',
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: summary });
    const out = await agreementApi.getCustomerSummary('cust-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/summary', {
      params: { customerId: 'cust-1' },
    });
    expect(out).toEqual(summary);
  });

  it('getVisitStatus GETs per-location PM status for the customer (LOC-1 P3)', async () => {
    const rows = [{ serviceLocationId: 'sl-1', pmOverdue: true, nextVisitDue: '2026-07-15' }];
    vi.mocked(apiClient.get).mockResolvedValue({ data: rows });
    const out = await agreementApi.getVisitStatus('cust-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/visit-status', {
      params: { customerId: 'cust-1' },
    });
    expect(out).toEqual(rows);
  });
});
