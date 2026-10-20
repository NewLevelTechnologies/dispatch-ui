// Straight from @dispatch/api, not the local ../api/setup wrapper: this file
// only needs a pure display helper and two types, and setup.ts configures
// Amplify as an import-time side effect — pulling that in here would mean
// every test of this pure function also has to stub out auth wiring it never
// touches.
import { dispatchRowTitle } from '@dispatch/api';
import type { DispatchBoardRow, DispatchStatus } from '@dispatch/api';
import { formatArrivalTime } from './formatArrivalTime';

export interface DispatchRowData {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  status: DispatchStatus;
}

/**
 * Shapes a board row into what `DispatchRow` needs to render — title/
 * subtitle precedence and the time format, kept out of the screen component
 * so it's testable without mounting anything. Deliberately returns the raw
 * `status` enum rather than a translated label: resolving it to text is the
 * screen's job (it has `useTranslation()`; this file doesn't need it).
 */
export function dispatchToRowData(row: DispatchBoardRow): DispatchRowData {
  // Same precedence as web's dispatchRowTitle, with a last-resort fallback
  // for the rare row with no WO summary/number/type AND no customer name yet
  // synced into scheduling's cache.
  const title = dispatchRowTitle(row) ?? row.customerName ?? '—';

  const location = [row.serviceLocationCity, row.serviceLocationState].filter(Boolean).join(', ');
  const subtitleParts = [
    // Don't repeat the customer name in the subtitle when it's already the title.
    row.customerName && row.customerName !== title ? row.customerName : null,
    location || null,
  ].filter((part): part is string => !!part);

  return {
    id: row.id,
    time: formatArrivalTime(row.arrivalWindowStart),
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : '—',
    status: row.status,
  };
}
