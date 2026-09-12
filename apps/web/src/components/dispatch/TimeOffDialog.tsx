// ─────────────────────────────────────────────────────────────────────
// "Robert just called out."
//
// The board is where that fact arrives — 6:40am, on the phone, looking at the
// day — so it is where the absence gets recorded. The board is a CLIENT of
// the availability entity, not its owner: no shift templates, no approval
// workflow, no accrual. A span exists or it does not.
//
// One surface for both directions, because the entity allows several spans on
// one day (a dentist appointment at 9 plus leaving at 3 is two rows, and
// collapsing them would print an arbitrary label over an arbitrary span). So
// the dialog lists what is already there, each removable, above the form that
// adds another.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { availabilityApi, type BoardTech } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Field, FieldGroup, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Switch } from '../catalyst/switch';
import { toIsoAt } from '../../lib/arrivalWindows';
import { formatHour, zonedHour } from '../../lib/boardTime';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { invalidateDispatchBoard } from '../../utils/invalidateRoleConsumers';

/** Midnight to midnight, so an all-day absence covers the whole day and a
 *  multi-day one is a single row rather than one per day. */
function allDaySpan(from: string, through: string): { startsAt: string; endsAt: string } {
  const end = new Date(`${through}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { startsAt: toIsoAt(from, 0), endsAt: toIsoAt(end.toISOString().slice(0, 10), 0) };
}

/** "8a–12p" in the TENANT's zone. */
function spanHours(span: { startsAt: string; endsAt: string }, timeZone: string): string {
  const start = zonedHour(span.startsAt, timeZone);
  const end = zonedHour(span.endsAt, timeZone);
  if (start == null || end == null) return '';
  return `${formatHour(start)}–${formatHour(end)}`;
}

function hourOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

export default function TimeOffDialog({
  tech,
  date,
  bookedVisits,
  timeZone,
  onClose,
}: {
  /** Null closes it — parent owns open state, like the other board surfaces. */
  tech: BoardTech | null;
  /** The day being viewed, which is what a call-out almost always means. */
  date: string;
  /** Visits already booked on this technician for `date`. Marking someone off
   *  never moves their work: a system that silently relocates a commitment is
   *  worse than one that tells you to deal with it. */
  bookedVisits: number;
  /** The tenant's zone, from the board read. Slicing the hours out of the ISO
   *  string instead would print an 8am absence as whatever UTC makes of it. */
  timeZone: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState(date);
  const [through, setThrough] = useState(date);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');

  /* eslint-disable react-hooks/set-state-in-effect -- re-seed transient form
     state on open, the same pattern as the other dialogs. */
  useEffect(() => {
    if (!tech) return;
    setLabel('');
    setAllDay(true);
    setFrom(date);
    setThrough(date);
    setStartTime('08:00');
    setEndTime('12:00');
  }, [tech, date]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The authoritative spans, with their ids — the board's own `timeOff` is a
  // display projection and carries none, so removal reads them here rather
  // than matching on timestamps.
  const { data: existing } = useQuery({
    queryKey: ['availability', tech?.id, date],
    queryFn: () =>
      availabilityApi.list({
        userId: tech!.id,
        from: toIsoAt(date, 0),
        to: toIsoAt(date, 24),
        size: 20,
      }),
    enabled: tech != null,
  });

  const spans = (existing?.content ?? []).filter((span) => span.status === 'OFF');

  const done = () => {
    invalidateDispatchBoard(queryClient);
    queryClient.invalidateQueries({ queryKey: ['availability'] });
  };

  const create = useMutation({
    mutationFn: () => {
      const span = allDay
        ? allDaySpan(from, through)
        : {
            startsAt: toIsoAt(from, hourOf(startTime)),
            endsAt: toIsoAt(from, hourOf(endTime)),
          };
      return availabilityApi.create({
        userId: tech!.id,
        ...span,
        allDay,
        status: 'OFF',
        label: label.trim(),
      });
    },
    onSuccess: () => {
      done();
      // Name what is left behind rather than just confirming the write: the
      // dispatcher now has work to reassign and nothing else will say so.
      showSuccess(
        bookedVisits > 0
          ? t('dispatchBoard.timeOff.savedWithWork', {
              name: tech?.name ?? '',
              count: bookedVisits,
              entity: getName('dispatch', true).toLowerCase(),
            })
          : t('dispatchBoard.timeOff.saved', { name: tech?.name ?? '' }),
      );
      onClose();
    },
    onError: (err) => showError(t('dispatchBoard.timeOff.failed'), extractApiError(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => availabilityApi.delete(id),
    onSuccess: () => {
      done();
      showSuccess(t('dispatchBoard.timeOff.cleared', { name: tech?.name ?? '' }));
    },
    onError: (err) => showError(t('dispatchBoard.timeOff.clearFailed'), extractApiError(err)),
  });

  if (!tech) return null;

  const valid = label.trim().length > 0 && (allDay ? through >= from : endTime > startTime);

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>{t('dispatchBoard.timeOff.title', { name: tech.name })}</DialogTitle>
      <DialogBody>
        {spans.length > 0 && (
          <div className="mb-4 flex flex-col gap-1.5">
            {spans.map((span) => (
              <div
                key={span.id}
                className="flex items-center gap-2 rounded-md border border-border-soft bg-bg-elev-2 px-2.5 py-1.5"
              >
                <span className="text-[12.5px] font-medium text-fg-strong">{span.label}</span>
                <span className="text-[11.5px] text-fg-muted">
                  {span.allDay ? t('dispatchBoard.timeOff.allDay') : spanHours(span, timeZone)}
                </span>
                <span className="grow" />
                <Button
                  plain
                  size="xs"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(span.id)}
                >
                  {t('dispatchBoard.timeOff.clear')}
                </Button>
              </div>
            ))}
          </div>
        )}

        <FieldGroup>
          <Field>
            {/* Required by the server on purpose, so a hatched row always says
                something rather than being a silent gap in the day. */}
            <Label>{t('dispatchBoard.timeOff.label')}</Label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('dispatchBoard.timeOff.labelPlaceholder')}
            />
          </Field>

          <Field>
            <Label>{t('dispatchBoard.timeOff.allDay')}</Label>
            <Switch checked={allDay} onChange={setAllDay} />
          </Field>

          {/* All-day spans run across days — "out all next week" is ONE row,
              which is the whole point of the span shape. A partial day across
              several days is incoherent, so the through-date only appears
              here. */}
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>{t('dispatchBoard.timeOff.date')}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            {allDay ? (
              <Field>
                <Label>{t('dispatchBoard.timeOff.through')}</Label>
                <Input
                  type="date"
                  min={from}
                  value={through}
                  onChange={(e) => setThrough(e.target.value)}
                />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>{t('dispatchBoard.timeOff.start')}</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </Field>
                <Field>
                  <Label>{t('dispatchBoard.timeOff.end')}</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </FieldGroup>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          color="accent"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          {t('dispatchBoard.timeOff.action')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
