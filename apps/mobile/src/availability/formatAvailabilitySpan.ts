import type { Availability } from '@dispatch/api';
import { dayKey } from '../schedule/dayGroups';

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * "Oct 20" for a single all-day span, "Oct 20 – 24" for a multi-day one,
 * "Oct 20, 8:00 AM – 12:00 PM" for a same-day partial span, or the full
 * start/end for a partial span that happens to cross midnight.
 */
export function formatAvailabilitySpan(availability: Pick<Availability, 'startsAt' | 'endsAt' | 'allDay'>): string {
  const start = new Date(availability.startsAt);
  const end = new Date(availability.endsAt);
  const sameDay = dayKey(start) === dayKey(end);

  if (availability.allDay) {
    return sameDay ? DAY.format(start) : `${DAY.format(start)} – ${DAY.format(end)}`;
  }

  if (sameDay) {
    return `${DAY.format(start)}, ${TIME.format(start)} – ${TIME.format(end)}`;
  }

  return `${DAY_TIME.format(start)} – ${DAY_TIME.format(end)}`;
}
