// ─────────────────────────────────────────────────────────────────────
// "Robert just called out."
//
// The board is where that fact arrives — 6:40am, on the phone, looking at the
// day — so it is where the absence gets recorded. The board is a CLIENT of
// the availability entity, not its owner: no shift templates, no approval
// workflow, no accrual. A span exists or it does not.
//
// Two shapes, both ONE row (§0b): all day across a range — "out all next
// week" is a span, never five rows — or part of a single day. The lane draws
// a part-day span as its own hatched slice and refuses drops only there, so
// the rest of that tech's day stays bookable.
//
// Clearing lives on the row menu, not in here: this dialog does one thing.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { availabilityApi, type BoardTech } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Description, Field, FieldGroup, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Callout } from '../ui/Callout';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { formatMoveDay } from '../../lib/boardMove';
import { formatHour, formatWindow } from '../../lib/boardTime';
import {
  allDaySpan,
  hitsTimeOff,
  partialSpan,
  TIME_OFF_HOURS,
  TIME_OFF_REASONS,
  type TimeOffReason,
} from '../../lib/timeOff';
import { extractApiError, showError, showUndo } from '../../lib/toast';
import { invalidateDispatchBoard } from '../../utils/invalidateRoleConsumers';

export default function TimeOffDialog({
  tech,
  date,
  visits,
  timeZone,
  onClose,
}: {
  /** Null closes it — parent owns open state, like the other board surfaces. */
  tech: BoardTech | null;
  /** The day being viewed, which is what a call-out almost always means. It
   *  is the start of the span; only the end is chosen. */
  date: string;
  /** Visits still live on this technician today. Marking someone off never
   *  moves their work — the dialog says so BEFORE saving, because a system
   *  that silently relocates a commitment is worse than one that tells you.
   *  The visits, not a count: a part-day absence strands only what it
   *  overlaps. */
  visits: { status: string; arrivalWindowStart: string; arrivalWindowEnd: string }[];
  /** The tenant's zone, from the board read. */
  timeZone: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState<TimeOffReason>('TIME_OFF');
  const [through, setThrough] = useState(date);
  const [partDay, setPartDay] = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(12);

  /* eslint-disable react-hooks/set-state-in-effect -- re-seed transient form
     state on open, the same pattern as the other dialogs. */
  useEffect(() => {
    if (!tech) return;
    setReason('TIME_OFF');
    setThrough(date);
    setPartDay(false);
    setStartHour(8);
    setEndHour(12);
  }, [tech, date]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const reasonLabel = (code: TimeOffReason) => t(`dispatchBoard.timeOff.reasons.${code}`);

  const refresh = () => {
    invalidateDispatchBoard(queryClient);
    queryClient.invalidateQueries({ queryKey: ['availability'] });
  };

  // Part of day is one day at a time, so a range forces all day.
  const multiDay = through > date;
  const part = partDay && !multiDay;
  const span = part
    ? { ...partialSpan(date, startHour, endHour, timeZone), allDay: false }
    : { ...allDaySpan(date, through, timeZone), allDay: true };
  // Same predicate as the chip and the outline, so the dialog's number is
  // the number that will be under the chip once this saves.
  const liveVisits = visits.filter((visit) => hitsTimeOff(visit, [span])).length;

  const create = useMutation({
    mutationFn: () =>
      availabilityApi.create({
        userId: tech!.id,
        ...span,
        status: 'OFF',
        label: reasonLabel(reason),
        reason,
      }),
    onSuccess: (created) => {
      refresh();
      const name = tech?.name ?? '';
      // Name what is left behind rather than just confirming the write: the
      // dispatcher now has work to reassign, and the chip is where it waits.
      showUndo(
        liveVisits > 0
          ? t('dispatchBoard.timeOff.savedWithWork', {
              name,
              count: liveVisits,
              entity: getName('dispatch', liveVisits !== 1).toLowerCase(),
              chip: t('dispatchBoard.chips.offtech', { tech: getName('technician') }),
            })
          : t('dispatchBoard.timeOff.saved', { name }),
        t('common.undo'),
        () => {
          availabilityApi
            .delete(created.id)
            .then(refresh)
            .catch(() => {
              refresh();
              showError(t('dispatchBoard.drag.undoFailed'));
            });
        },
      );
      onClose();
    },
    onError: (err) => showError(t('dispatchBoard.timeOff.failed'), extractApiError(err)),
  });

  if (!tech) return null;

  const firstName = tech.name.split(' ')[0] || tech.name;

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogTitle>{t('dispatchBoard.timeOff.title', { name: tech.name })}</DialogTitle>
      <DialogBody>
        <FieldGroup>
          <Field>
            <Label>{t('dispatchBoard.timeOff.reason')}</Label>
            <ToggleGroup
              value={reason}
              onChange={setReason}
              size="sm"
              className="mt-2"
              aria-label={t('dispatchBoard.timeOff.reason')}
            >
              {TIME_OFF_REASONS.map((code) => (
                <ToggleGroupOption key={code} value={code}>
                  {reasonLabel(code)}
                </ToggleGroupOption>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <Label>{t('dispatchBoard.timeOff.howLong')}</Label>
            <ToggleGroup
              value={part ? 'part' : 'allDay'}
              onChange={(value) => setPartDay(value === 'part')}
              size="sm"
              className="mt-2"
              aria-label={t('dispatchBoard.timeOff.howLong')}
            >
              <ToggleGroupOption value="allDay">{t('dispatchBoard.timeOff.allDay')}</ToggleGroupOption>
              <ToggleGroupOption value="part" disabled={multiDay}>
                {t('dispatchBoard.timeOff.partOfDay')}
              </ToggleGroupOption>
            </ToggleGroup>
            {multiDay && <Description>{t('dispatchBoard.timeOff.partOneDay')}</Description>}
          </Field>

          {part ? (
            <Field>
              <Label>{t('dispatchBoard.timeOff.between')}</Label>
              <div className="mt-2 flex items-center gap-2">
                <div className="w-28">
                  <Select
                    aria-label={t('dispatchBoard.timeOff.from')}
                    value={String(startHour)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setStartHour(next);
                      // Keep the span non-empty rather than raising an error
                      // the dispatcher then has to go and fix.
                      if (endHour <= next) setEndHour(next + 0.5);
                    }}
                  >
                    {TIME_OFF_HOURS.slice(0, -1).map((hour) => (
                      <option key={hour} value={hour}>
                        {formatHour(hour)}
                      </option>
                    ))}
                  </Select>
                </div>
                <span className="text-[11.5px] text-fg-muted">{t('dispatchBoard.timeOff.to')}</span>
                <div className="w-28">
                  <Select
                    aria-label={t('dispatchBoard.timeOff.until')}
                    value={String(endHour)}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                  >
                    {TIME_OFF_HOURS.filter((hour) => hour > startHour).map((hour) => (
                      <option key={hour} value={hour}>
                        {formatHour(hour)}
                      </option>
                    ))}
                  </Select>
                </div>
                <span className="text-[11.5px] text-fg-muted">
                  {`${formatMoveDay(date)}, ${formatWindow(startHour, endHour)}`}
                </span>
              </div>
            </Field>
          ) : (
          <Field>
            <Label>{t('dispatchBoard.timeOff.through')}</Label>
            <div className="mt-2 flex items-center gap-3">
              <div className="w-44">
                <Input
                  type="date"
                  min={date}
                  value={through}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Never before the viewed day: the span starts there.
                    if (value) setThrough(value < date ? date : value);
                  }}
                />
              </div>
              <span className="text-[11.5px] text-fg-muted">
                {multiDay
                  ? `${formatMoveDay(date)} – ${formatMoveDay(through)}`
                  : t('dispatchBoard.timeOff.allDayOn', { day: formatMoveDay(date) })}
              </span>
            </div>
          </Field>
          )}

          {liveVisits > 0 && (
            <Callout kind="warning">
              {t('dispatchBoard.timeOff.liveWork', {
                count: liveVisits,
                entity: getName('dispatch', liveVisits !== 1).toLowerCase(),
                name: firstName,
                chip: t('dispatchBoard.chips.offtech', { tech: getName('technician') }),
              })}
            </Callout>
          )}
        </FieldGroup>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button color="accent" disabled={create.isPending} onClick={() => create.mutate()}>
          {t('dispatchBoard.timeOff.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
