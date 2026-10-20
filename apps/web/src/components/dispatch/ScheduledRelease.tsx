// Scheduled release — "Release at 7:00a". A timer on the Release button, not a
// snapshot: the server sends whatever is pending when it runs, in the scope it
// was set from. So the button's count and the pills are two facts, rendered
// side by side and never merged: the count is what Release sends NOW, a pill
// is what's queued.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon, ChevronDownIcon, ClockIcon } from '@heroicons/react/16/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import type { ScheduledRelease } from '../../api/setup';
import { Button } from '../catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownHeader,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../catalyst/dropdown';
import { Input } from '../catalyst/input';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { toIsoAt } from '../../lib/arrivalWindows';
import { shiftDay } from '../../lib/boardMove';
import { formatHour, zonedHour } from '../../lib/boardTime';
import {
  canReleaseDayBefore,
  defaultReleaseHour,
  hourFromTimeValue,
  isLateSend,
  isPendingSchedule,
  releasePicks,
  releaseTimeProblem,
  releaseWhen,
  scheduledFor,
  timeValueFromHour,
  weekdayOf,
} from '../../lib/scheduledRelease';

/** "MST" — the panel names the zone the times are in. */
function zoneAbbrev(timeZone: string, date: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
        .formatToParts(new Date(toIsoAt(date, 12, timeZone)))
        .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
    );
  } catch {
    return timeZone;
  }
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || '—';
}

function useCountsLine() {
  const { t } = useTranslation();
  return (r: ScheduledRelease) =>
    [
      r.newCount ? t('dispatchBoard.release.partNew', { count: r.newCount }) : null,
      r.changedCount ? t('dispatchBoard.release.partChanged', { count: r.changedCount }) : null,
      r.removedCount ? t('dispatchBoard.release.partRemoved', { count: r.removedCount }) : null,
    ]
      .filter(Boolean)
      .join(' · ') || t('dispatchBoard.scheduledRelease.nothingSent');
}

// ── The Release button + its clock ────────────────────────────────

export interface ReleaseControlsProps {
  date: string;
  timeZone: string;
  /** What pressing Release sends right now — the server's number. */
  pendingTotal: number;
  /** "3 new · 1 changed — every technician row showing". */
  tooltip: string;
  releasing: boolean;
  /** An overdue record with work still pending: the button turns primary. */
  urgent: boolean;
  /** False on a past day: the pills stay as history, the buttons go. */
  canRelease: boolean;
  /** The clock is day-view only: a scheduled release is per day. */
  canSchedule: boolean;
  records: ScheduledRelease[];
  currentUserId: string | undefined;
  /** The view's scope, stated in the panel ("HVAC" / "every technician row showing"). */
  scopeLabel: string;
  /** A record's own scope, when narrower than every region. */
  recordScope: (record: ScheduledRelease) => string | null;
  onRelease: () => void;
  /** Resolves once saved; the panel closes then, and stays open on failure. */
  onSchedule: (releaseAt: string) => Promise<unknown>;
  scheduling: boolean;
  onCancel: (record: ScheduledRelease) => void;
}

export function ReleaseControls({
  date,
  timeZone,
  pendingTotal,
  tooltip,
  releasing,
  urgent,
  canRelease,
  canSchedule,
  records,
  currentUserId,
  scopeLabel,
  recordScope,
  onRelease,
  onSchedule,
  scheduling,
  onCancel,
}: ReleaseControlsProps) {
  const { t } = useTranslation();
  const [panelOpen, setPanelOpen] = useState(false);
  const mine = records.find(
    (r) => isPendingSchedule(r) && currentUserId != null && r.createdByUserId === currentUserId,
  );

  return (
    <>
      {/* One pill per record, beside the group. Names, never "+1 other". */}
      {records.map((record) => (
        <ReleasePill
          key={record.id}
          record={record}
          date={date}
          timeZone={timeZone}
          mine={currentUserId != null && record.createdByUserId === currentUserId}
          scope={recordScope(record)}
          onChangeTime={() => setPanelOpen(true)}
          onCancel={() => onCancel(record)}
        />
      ))}

      {canRelease && (
      <div className="db-rel-anchor">
        <div className={canSchedule ? 'db-rel-group' : 'db-rel-group solo'}>
          {/* Stays at 0 on today and future days: scheduling a release for an
              empty day is legitimate, and the disabled button says why there
              is nothing to press. */}
          {urgent ? (
            <Button
              color="accent"
              size="xxs"
              onClick={onRelease}
              disabled={releasing}
              title={tooltip}
            >
              <CheckIcon />
              {t('dispatchBoard.release.action', { count: pendingTotal })}
            </Button>
          ) : (
            <Button
              outline
              size="xxs"
              onClick={onRelease}
              disabled={releasing || pendingTotal === 0}
              title={pendingTotal > 0 ? tooltip : t('dispatchBoard.release.nothingPending')}
            >
              <CheckIcon />
              {pendingTotal > 0
                ? t('dispatchBoard.release.action', { count: pendingTotal })
                : t('dispatchBoard.release.confirmAction')}
            </Button>
          )}
          {canSchedule && (
            <Button
              outline
              size="xxs"
              aria-label={t('dispatchBoard.scheduledRelease.clockLabel')}
              aria-expanded={panelOpen}
              title={t(
                mine
                  ? 'dispatchBoard.scheduledRelease.titleMove'
                  : 'dispatchBoard.scheduledRelease.clockTitle',
              )}
              onClick={() => setPanelOpen((open) => !open)}
            >
              <ClockIcon />
            </Button>
          )}
        </div>
        {panelOpen && canSchedule && (
          <ReleaseAtPanel
            date={date}
            timeZone={timeZone}
            mine={mine ?? null}
            scopeLabel={scopeLabel}
            saving={scheduling}
            onSave={(releaseAt) => onSchedule(releaseAt).then(() => setPanelOpen(false))}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
      )}
    </>
  );
}

// ── "Release at…" ─────────────────────────────────────────────────

function ReleaseAtPanel({
  date,
  timeZone,
  mine,
  scopeLabel,
  saving,
  onSave,
  onClose,
}: {
  date: string;
  timeZone: string;
  mine: ScheduledRelease | null;
  scopeLabel: string;
  saving: boolean;
  onSave: (releaseAt: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Read once: the panel is open for seconds, and picks that dropped out
  // under the pointer would change the options mid-choice.
  const [now] = useState(() => new Date());
  const withDayBefore = canReleaseDayBefore(date, now, timeZone);
  const initial = mine ? scheduledFor(mine, date, timeZone) : null;
  const [dayBefore, setDayBefore] = useState(withDayBefore && (initial?.dayBefore ?? false));
  const picks = releasePicks(date, dayBefore, now, timeZone);

  // One time, from either control: a pick, or what was typed. An existing
  // time that is a pick highlights it; any other fills the field.
  const openingHour = initial?.hour ?? defaultReleaseHour(date, dayBefore, now, timeZone);
  const [hour, setHour] = useState<number | null>(openingHour);
  const [typed, setTyped] = useState(
    openingHour != null && !picks.includes(openingHour) ? timeValueFromHour(openingHour) : '',
  );
  const pickValue = !typed && hour != null && picks.includes(hour) ? String(hour) : '';

  const problem =
    hour == null ? null : releaseTimeProblem(hour, date, dayBefore, now, timeZone);

  const switchDay = (next: boolean) => {
    setDayBefore(next);
    // Each side has its own picks; land on that side's default, not a time
    // the other side made sense of.
    const fresh = defaultReleaseHour(date, next, now, timeZone);
    const freshPicks = releasePicks(date, next, now, timeZone);
    setHour(fresh);
    setTyped(fresh != null && !freshPicks.includes(fresh) ? timeValueFromHour(fresh) : '');
  };

  const prevDay = weekdayOf(shiftDay(date, -1), timeZone);
  const dayLabel = new Date(toIsoAt(date, 12, timeZone)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
  const when = hour == null ? '' : dayBefore ? `${prevDay} ${formatHour(hour)}` : formatHour(hour);

  // Esc or a click elsewhere closes it, like the week peek.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const save = () => {
    if (hour == null || problem) return;
    onSave(toIsoAt(dayBefore ? shiftDay(date, -1) : date, hour, timeZone)).catch(() => {
      // The mutation toasts the failure; the panel stays open to retry.
    });
  };

  const title = t(
    mine ? 'dispatchBoard.scheduledRelease.titleMove' : 'dispatchBoard.scheduledRelease.title',
    { day: dayLabel },
  );

  return (
    <div ref={ref} className="db-rel-pop" role="dialog" aria-label={title}>
      <div className="db-rel-pop-h">{title}</div>
      {withDayBefore && (
        <ToggleGroup
          value={dayBefore ? 'before' : 'day'}
          onChange={(value) => switchDay(value === 'before')}
          size="sm"
          aria-label={t('dispatchBoard.scheduledRelease.whichDay')}
        >
          <ToggleGroupOption value="before">
            {t('dispatchBoard.scheduledRelease.eveningBefore', { day: prevDay })}
          </ToggleGroupOption>
          <ToggleGroupOption value="day">{dayLabel}</ToggleGroupOption>
        </ToggleGroup>
      )}
      {/* A radio group, so the picks work from the keyboard. */}
      {picks.length > 0 && (
        <ToggleGroup
          value={pickValue}
          onChange={(value) => {
            setHour(Number(value));
            setTyped('');
          }}
          size="sm"
          aria-label={t('dispatchBoard.scheduledRelease.picks')}
        >
          {picks.map((pick) => (
            <ToggleGroupOption key={pick} value={String(pick)}>
              {formatHour(pick)}
            </ToggleGroupOption>
          ))}
        </ToggleGroup>
      )}
      <label className="db-rel-row">
        <span>
          {t(
            picks.length > 0
              ? 'dispatchBoard.scheduledRelease.otherTime'
              : 'dispatchBoard.scheduledRelease.time',
          )}
        </span>
        {/* step is the spinner's increment only. Any minute is valid, so a
            7:10 the browser calls a step mismatch is never refused — only
            the range rule disables Schedule. */}
        <Input
          type="time"
          step={900}
          size="xs"
          className="db-rel-time"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setHour(hourFromTimeValue(e.target.value));
          }}
        />
        <span className="db-rel-tz">
          {t('dispatchBoard.scheduledRelease.boardTime', { zone: zoneAbbrev(timeZone, date) })}
        </span>
      </label>
      {problem && (
        <div className="db-rel-err">
          {t(
            problem === 'beforeEvening'
              ? 'dispatchBoard.scheduledRelease.beforeEvening'
              : 'dispatchBoard.scheduledRelease.passed',
          )}
        </div>
      )}
      <div className="db-rel-note">
        {t('dispatchBoard.scheduledRelease.note')}{' '}
        {t('dispatchBoard.scheduledRelease.scope')} <b>{scopeLabel}</b>.
      </div>
      <div className="flex justify-end gap-2">
        <Button plain size="xxs" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          color="accent"
          size="xxs"
          onClick={save}
          disabled={hour == null || problem != null || saving}
        >
          {hour == null
            ? t('dispatchBoard.scheduledRelease.pickTime')
            : t(
                mine
                  ? 'dispatchBoard.scheduledRelease.moveTo'
                  : 'dispatchBoard.scheduledRelease.scheduleFor',
                { when },
              )}
        </Button>
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────

function ReleasePill({
  record,
  date,
  timeZone,
  mine,
  scope,
  onChangeTime,
  onCancel,
}: {
  record: ScheduledRelease;
  date: string;
  timeZone: string;
  mine: boolean;
  scope: string | null;
  onChangeTime: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const countsLine = useCountsLine();
  const when = releaseWhen(record, date, timeZone);

  if (record.status === 'SENT' && record.sentAt) {
    const sentHour = zonedHour(record.sentAt, timeZone) ?? 0;
    const late = isLateSend(record);
    return (
      <span className="db-rel-pill sent">
        <CheckIcon />
        {t('dispatchBoard.scheduledRelease.sent', {
          time: formatHour(sentHour),
          parts: countsLine(record),
        })}
        {/* The only explanation a dispatcher gets for why techs were texted
            at 10:32: the service was down at 7. */}
        {/* Released by hand after the schedule failed: the schedule didn't
            send it, so the pill doesn't pretend it did. */}
        {record.sentBy === 'MANUAL' ? (
          <span className="db-rel-late">
            {t('dispatchBoard.scheduledRelease.byHand', { time: when })}
          </span>
        ) : (
          late && (
            <span className="db-rel-late">
              {t('dispatchBoard.scheduledRelease.due', { time: when })}
            </span>
          )
        )}
      </span>
    );
  }

  if (record.overdue) {
    return (
      <span className="db-rel-pill overdue">
        <ClockIcon />
        {t('dispatchBoard.scheduledRelease.overdue', { when })}
      </span>
    );
  }

  // Mid-run: past cancelling, not yet a result.
  if (record.status === 'SENDING') {
    return (
      <span className="db-rel-pill">
        <ClockIcon />
        {t('dispatchBoard.scheduledRelease.sending', { when })}
      </span>
    );
  }

  const who = mine ? t('dispatchBoard.scheduledRelease.you') : firstName(record.createdByName);
  return (
    <Dropdown>
      <DropdownButton
        as="button"
        type="button"
        className="db-rel-pill scheduled"
        title={t('dispatchBoard.scheduledRelease.setBy', {
          name: mine ? t('dispatchBoard.scheduledRelease.youLower') : record.createdByName ?? '—',
        })}
      >
        <ClockIcon />
        {t('dispatchBoard.scheduledRelease.scheduled', { when, who })}
        {scope && <span className="db-rel-late">· {scope}</span>}
        <ChevronDownIcon />
      </DropdownButton>
      <DropdownMenu anchor="bottom start">
        <DropdownHeader>
          <span className="text-[11.5px] text-fg-muted">
            {t('dispatchBoard.scheduledRelease.setBy', {
              name: mine ? t('dispatchBoard.scheduledRelease.youLower') : record.createdByName ?? '—',
            })}
          </span>
        </DropdownHeader>
        {/* Someone else's record offers Cancel only: "change" would mean
            creating your own, which the clock already does. */}
        {mine && (
          <DropdownItem onClick={onChangeTime}>
            <DropdownLabel>{t('dispatchBoard.scheduledRelease.changeTime')}</DropdownLabel>
          </DropdownItem>
        )}
        <DropdownItem onClick={onCancel}>
          <DropdownLabel className="text-danger-500">
            {mine
              ? t('dispatchBoard.scheduledRelease.cancelMine')
              : t('dispatchBoard.scheduledRelease.cancelTheirs', {
                  name: firstName(record.createdByName),
                })}
          </DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}

// ── Overdue strip ─────────────────────────────────────────────────

/**
 * Overdue escalates OUT of the pill. It is the only release state where doing
 * nothing leaves techs without a schedule, and nothing retries it — a retry
 * after a partial send would text the same techs twice. A pill alone is the
 * same size as a Sent line, so the failure would read as history.
 */
export function OverdueReleaseStrip({
  record,
  date,
  timeZone,
  mine,
  releasing,
  onReleaseNow,
}: {
  record: ScheduledRelease;
  date: string;
  timeZone: string;
  mine: boolean;
  releasing: boolean;
  onReleaseNow: () => void;
}) {
  const { t } = useTranslation();
  // The RECORD's count, for its stored scope — not the view's. Release now
  // sends exactly that, whatever the board is filtered to.
  const pending = record.pendingRelease?.total ?? 0;
  return (
    <div className="db-rel-overdue" role="alert">
      <ExclamationTriangleIcon className="db-rel-overdue-ic" aria-hidden="true" />
      <span className="grow">
        <b>
          {t('dispatchBoard.scheduledRelease.overdueTitle', {
            when: releaseWhen(record, date, timeZone),
          })}
        </b>{' '}
        {t('dispatchBoard.scheduledRelease.overduePending', { count: pending })}{' '}
        {t('dispatchBoard.scheduledRelease.overdueNoRetry')}{' '}
        <span className="db-rel-by">
          {t('dispatchBoard.scheduledRelease.overdueBy', {
            name: mine ? t('dispatchBoard.scheduledRelease.youLower') : record.createdByName ?? '—',
          })}
        </span>
      </span>
      <Button color="accent" size="xxs" onClick={onReleaseNow} disabled={releasing}>
        <CheckIcon />
        {t('dispatchBoard.scheduledRelease.releaseNow', { count: pending })}
      </Button>
    </div>
  );
}
