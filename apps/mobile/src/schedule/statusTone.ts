import type { DispatchStatus } from '@dispatch/api';
import type { PillTone } from '../components';

/**
 * Maps a dispatch's lifecycle status to a StatusPill tone. Mirrors the
 * urgency a technician actually cares about: a visit in progress or en route
 * is the one that should pop (accent), a no-show is the one that needs a
 * second look (danger) — not just "pick a different color per enum value".
 */
export function statusTone(status: DispatchStatus): PillTone {
  switch (status) {
    case 'EN_ROUTE':
      return 'accent';
    case 'IN_PROGRESS':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'NO_SHOW':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    case 'SCHEDULED':
    default:
      return 'info';
  }
}
