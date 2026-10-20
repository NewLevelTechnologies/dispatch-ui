import type { ProgressCategory } from '@dispatch/api';
import type { PillTone } from '../components';

/**
 * Maps a work item's `statusCategory` to a StatusPill tone. The tenant's
 * actual status NAME is configurable (`workItemStatusesApi`); this fixed
 * 6-value category is what every custom status maps back to, so it's the
 * only thing safe to hang a color on.
 */
export function workItemStatusTone(category: ProgressCategory): PillTone {
  switch (category) {
    case 'IN_PROGRESS':
      return 'warning';
    case 'BLOCKED':
      return 'danger';
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
      return 'neutral';
    case 'AWAITING_SCHEDULE':
    case 'NOT_STARTED':
    default:
      return 'info';
  }
}
