import type { BoardDispatch, DispatchStatus } from '@dispatch/api';
import { formatArrivalTime } from './formatArrivalTime';

export interface DispatchRowData {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  status: DispatchStatus;
}

/**
 * Shapes a board dispatch into what `DispatchRow` needs. Title/subtitle
 * precedence follows the board's own documented rule for the operative
 * location label — `BoardDispatch.serviceLocationName`'s doc comment:
 * "Rendered as `serviceLocationName || customerName`... many sites have no
 * name (residential usually doesn't), and the customer is the right
 * fallback, not a placeholder."
 */
export function boardDispatchToRowData(row: BoardDispatch): DispatchRowData {
  // No `workOrderTypeName` on a board row (unlike the old DispatchBoardRow) —
  // only `workOrderTypeId`, a raw id unfit to show, so that rung is dropped
  // rather than ported.
  const title = row.workOrderSummary || row.workOrderNumber || row.customerName || '—';

  const place = row.serviceLocationName || row.customerName;
  const cityState = [row.serviceLocationCity, row.serviceLocationState].filter(Boolean).join(', ');
  const subtitleParts = [
    // Don't repeat the place in the subtitle when it's already the title.
    place && place !== title ? place : null,
    cityState || null,
  ].filter((part): part is string => !!part);

  return {
    id: row.id,
    time: formatArrivalTime(row.arrivalWindowStart),
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : '—',
    status: row.status,
  };
}
