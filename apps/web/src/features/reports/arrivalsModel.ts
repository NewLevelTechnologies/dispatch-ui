// The Arrival windows report's shaping. The server owns every count and rate;
// this buckets the days for the chart, formats rates and windows, and writes
// the late-visit CSV.
import type { ArrivalDay, ArrivalReportGroupBy, LateArrival } from '../../api/setup';
import { buckets, type ChartBucket, type ChartUnit } from './revenueModel';
import { titleCaseAddress } from '@dispatch/utils';
import { csvLines } from './csv';

export const ARRIVAL_GROUP_BYS: ArrivalReportGroupBy[] = ['technician', 'region', 'none'];
/** The late list's page and its technician filter. */
export const LATE_PAGE_PARAM = 'latePage';
export const TECH_PARAM = 'tech';

/** On-time rate per bucket: on time ÷ arrived, 0 for a bucket with no arrivals. */
export function rateBuckets(days: ArrivalDay[], unit: ChartUnit): ChartBucket[] {
  const arrived = buckets(days.map((d) => ({ date: d.date, amount: d.arrived })), unit);
  const onTime = buckets(days.map((d) => ({ date: d.date, amount: d.onTime })), unit);
  return arrived.map((b, i) => ({ ...b, amount: b.amount > 0 ? onTime[i].amount / b.amount : 0 }));
}

/** "88.2%", or a dash with nothing to rate. */
export const formatRate = (rate: number | null | undefined) =>
  rate == null ? '—' : `${(rate * 100).toFixed(1)}%`;

/** A rate's change in percentage points: "+1.9 pts"; null when either side is missing. */
export function pointsChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 1000) / 10;
}
export const formatPoints = (pts: number) => `${pts >= 0 ? '+' : '−'}${Math.abs(pts).toFixed(1)} pts`;

/** "18 min", "1 h 05 min". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "Sep 4" and "9:00 – 11:00 AM", in the tenant's zone. */
export function windowParts(start: string, end: string, timeZone: string): { day: string; time: string } {
  const day = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
  const split = (iso: string) => {
    const text = clockTime(iso, timeZone);
    const m = text.match(/^(.*?)[\s\u202f]([AP]M)$/);
    return m ? { clock: m[1], period: m[2] } : { clock: text, period: '' };
  };
  const a = split(start);
  const b = split(end);
  const time =
    a.period === b.period
      ? `${a.clock} – ${b.clock} ${b.period}`
      : `${a.clock} ${a.period} – ${b.clock} ${b.period}`;
  return { day, time: time.trim() };
}

/** "9:47 AM" in the tenant's zone. */
export const clockTime = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });

export interface LateCsvLabels {
  headers: string[];
  region: (id: string | null) => string;
  timeZone: string;
}

/** One row per late visit; times in the tenant's zone. */
export function lateCsv(rows: LateArrival[], { headers, region, timeZone }: LateCsvLabels): string {
  const zoned = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-CA', { timeZone });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
    return `${date} ${time}`;
  };
  return csvLines([
    headers,
    ...rows.map((r) => [
      zoned(r.arrivalWindowStart),
      zoned(r.arrivalWindowEnd),
      zoned(r.arrivedAt),
      r.minutesLate,
      r.technicianName ?? '',
      region(r.regionId),
      r.customerName,
      [r.serviceLocation.name, titleCaseAddress(r.serviceLocation.streetAddress ?? ''), titleCaseAddress(r.serviceLocation.city ?? '')]
        .filter(Boolean)
        .join(', '),
      r.workOrderNumber,
    ]),
  ]);
}
