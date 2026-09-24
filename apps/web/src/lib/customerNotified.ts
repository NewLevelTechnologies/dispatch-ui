// "Was the customer told?" — asked about the CURRENT window, not ever.
//
// A notice about Friday says nothing about Monday. So a customer log only
// counts once it post-dates the last time the promise changed: the dispatch's
// `windowChangedAt` (null = never changed since create, so every notice
// counts). One rule, shared by the board's move confirm and the dispatch
// drawer, so the two can never disagree about the same visit.
import type { NotificationLogDto } from '../api/setup';

const sent = (log: NotificationLogDto) =>
  log.audience === 'CUSTOMER' && (log.status === 'SENT' || log.status === 'DELIVERED');

const at = (log: NotificationLogDto) => log.sentAt ?? log.createdAt;

/** When the customer was first told about the window they now hold, or null
 *  if no notice has gone out since it last changed. */
export function customerNotifiedAt(
  logs: NotificationLogDto[],
  windowChangedAt: string | null | undefined,
): string | null {
  const changed = windowChangedAt ? Date.parse(windowChangedAt) : null;
  const times = logs
    .filter(sent)
    .map(at)
    .filter((s): s is string => Boolean(s))
    .filter((s) => changed == null || Date.parse(s) > changed)
    .sort();
  return times[0] ?? null;
}

/** Any customer notice, about any window. A customer who heard about an
 *  earlier date still holds a promise, even if not this one. */
export function customerEverNotified(logs: NotificationLogDto[]): boolean {
  return logs.some(sent);
}
