import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  periodsPerYear,
  computeArr,
  cadenceLabel,
  cadenceAbbr,
  formatCurrency,
  formatDay,
  formatDayNoYear,
  formatWindow,
  daysUntil,
  locationLabel,
  agreementCoverageQueryOptions,
  agreementVisitsQueryOptions,
  agreementComplianceQueryOptions,
  agreementBillingQueryOptions,
  agreementLocationsQueryOptions,
  type LocationMap,
} from './agreementShared';
import { agreementApi, customerApi, type BillingScheduleResponse, type ServiceLocation } from '../../api';

vi.mock('../../api', () => ({
  agreementApi: {
    getCoverage: vi.fn(),
    getVisits: vi.fn(),
    getCompliance: vi.fn(),
    getBillingSchedule: vi.fn(),
  },
  customerApi: { getServiceLocations: vi.fn() },
}));

const billing = (over: Partial<BillingScheduleResponse>): BillingScheduleResponse => ({
  agreementId: 'a-1',
  amount: 27000,
  cadenceUnit: 'QUARTER',
  cadenceInterval: 1,
  anchorDate: '2026-01-01',
  netDays: 30,
  billingMode: 'FIXED_SCHEDULE',
  active: true,
  ...over,
});

describe('agreementShared helpers', () => {
  it('periodsPerYear maps cadence units and honors interval', () => {
    expect(periodsPerYear('WEEK')).toBe(52);
    expect(periodsPerYear('MONTH')).toBe(12);
    expect(periodsPerYear('QUARTER')).toBe(4);
    expect(periodsPerYear('YEAR')).toBe(1);
    expect(periodsPerYear('QUARTER', 2)).toBe(2);
    expect(periodsPerYear('QUARTER', 0)).toBe(4); // guards divide-by-zero
  });

  it('computeArr only annualizes FIXED_SCHEDULE', () => {
    expect(computeArr(billing({}))).toBe(108000);
    expect(computeArr(billing({ billingMode: 'PER_VISIT' }))).toBeNull();
  });

  it('cadenceLabel / cadenceAbbr read naturally', () => {
    expect(cadenceLabel('QUARTER')).toBe('Quarterly');
    expect(cadenceLabel('MONTH', 1)).toBe('Monthly');
    expect(cadenceLabel('WEEK', 2)).toBe('Every 2 weeks');
    expect(cadenceAbbr('QUARTER')).toBe('qtr');
    expect(cadenceAbbr('YEAR')).toBe('yr');
  });

  it('formatCurrency handles values and nullish', () => {
    expect(formatCurrency(108000)).toBe('$108,000');
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });

  it('formatDay parses date-only strings without TZ drift', () => {
    expect(formatDay('2026-07-01')).toBe('Jul 1, 2026');
    expect(formatDayNoYear('2026-07-01')).toBe('Jul 1');
    expect(formatDay(null)).toBe('—');
    expect(formatDay('not-a-date')).toBe('—');
  });

  it('formatWindow renders a range, a single day, or a dash', () => {
    expect(formatWindow('2026-07-01', '2026-07-30')).toBe('Jul 1 – Jul 30, 2026');
    expect(formatWindow('2026-07-01')).toBe('Jul 1, 2026');
    expect(formatWindow(null)).toBe('—');
  });

  it('daysUntil returns a number for a date and null for nullish', () => {
    expect(daysUntil(null)).toBeNull();
    expect(typeof daysUntil('2099-01-01')).toBe('number');
    expect(daysUntil('2099-01-01')).toBeGreaterThan(0);
  });

  it('locationLabel resolves a hit and falls back on a miss', () => {
    const map: LocationMap = new Map([
      ['sl-1', { id: 'sl-1', locationName: 'Retail #001', address: { streetAddress: '123 MAIN ST', city: 'SCOTTSDALE', state: 'AZ', zipCode: '85251' } } as unknown as ServiceLocation],
      ['sl-2', { id: 'sl-2', address: { streetAddress: '99 OAK AVE NE', city: 'ATLANTA', state: 'GA', zipCode: '30306' } } as unknown as ServiceLocation],
    ]);
    // Named location: name on top, full title-cased address as the sub.
    expect(locationLabel(map, 'sl-1')).toEqual({ name: 'Retail #001', sub: '123 Main St · Scottsdale, AZ 85251' });
    // Unnamed: street leads (and is dropped from the sub to avoid repetition); directionals stay upper.
    expect(locationLabel(map, 'sl-2')).toEqual({ name: '99 Oak Ave NE', sub: 'Atlanta, GA 30306' });
    expect(locationLabel(map, 'missing-id').name).toContain('Location');
    expect(locationLabel(undefined, 'sl-1').name).toContain('Location');
  });
});

describe('agreementShared query-option factories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coverage factory keys + queryFn', () => {
    const opts = agreementCoverageQueryOptions('a-1');
    expect(opts.queryKey).toEqual(['agreement', 'a-1', 'coverage']);
    opts.queryFn();
    expect(agreementApi.getCoverage).toHaveBeenCalledWith('a-1');
  });

  it('visits factory keys by `when` + passes limit', () => {
    const opts = agreementVisitsQueryOptions('a-1', 'recent', 50);
    expect(opts.queryKey).toEqual(['agreement', 'a-1', 'visits', 'recent']);
    opts.queryFn();
    expect(agreementApi.getVisits).toHaveBeenCalledWith('a-1', { when: 'recent', limit: 50 });
  });

  it('compliance + billing factories disable retry and call their reads', () => {
    const c = agreementComplianceQueryOptions('a-1');
    expect(c.queryKey).toEqual(['agreement', 'a-1', 'compliance']);
    expect(c.retry).toBe(false);
    c.queryFn();
    expect(agreementApi.getCompliance).toHaveBeenCalledWith('a-1');

    const b = agreementBillingQueryOptions('a-1');
    expect(b.queryKey).toEqual(['agreement', 'a-1', 'billing-schedule']);
    expect(b.retry).toBe(false);
    b.queryFn();
    expect(agreementApi.getBillingSchedule).toHaveBeenCalledWith('a-1');
  });

  it('locations factory fetches by customer and selects into a Map', () => {
    const opts = agreementLocationsQueryOptions('c-1');
    expect(opts.queryKey).toEqual(['agreement-locations', 'c-1']);
    opts.queryFn();
    expect(customerApi.getServiceLocations).toHaveBeenCalledWith('c-1');
    const map = opts.select([{ id: 'sl-1' }, { id: 'sl-2' }] as ServiceLocation[]);
    expect(map.get('sl-1')).toEqual({ id: 'sl-1' });
    expect(map.size).toBe(2);
  });
});
