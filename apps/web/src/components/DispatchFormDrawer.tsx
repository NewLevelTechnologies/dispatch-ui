/* eslint-disable i18next/no-literal-string -- dense operational composer; short scheduling labels stay literal (same convention as WorkOrderFileUploadDialog / WorkOrderFilesTab). Entity names still route through getName(). */
// Dispatch create / edit — the compose+edit counterpart to the read-only trip
// drawer (DispatchDetailDrawer). Same right-side SlideOver chrome, so scheduling
// or editing a dispatch feels like the same object you view. Replaces the legacy
// AssignTechnicianDialog. Sections: Work addressed → When → Assign tech → Release.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { CalendarDaysIcon, CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  dispatchesApi,
  userApi,
  type Dispatch,
  type ProgressCategory,
  type User,
  type WorkItemResponse,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { errorCode, isConflict } from '../lib/toast';
import { invalidateDispatchConsumers } from '../utils/invalidateRoleConsumers';
import { SlideOver } from './catalyst/slideover';
import { Button } from './catalyst/button';
import { Avatar } from './ui/Avatar';
import ConfirmDialog from './ConfirmDialog';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { zonedDateOf, zonedHourOf, zonedIso } from '../lib/zonedTime';
import { Pill } from './ui/Pill';
import type { DispatchSeed } from './DispatchDetailDrawer';
import { workItemLabel } from '@dispatch/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workItems: WorkItemResponse[];
  locationName?: string;
  workOrderNumber?: string;
  // Present = edit mode (prefilled); absent = create.
  /** The visit being edited. A SEED rather than a full `Dispatch`: the form
   *  reads only the assignment, the window, the addressed items and the
   *  version, all of which a board row carries — so the board can open this
   *  straight off the grid without a round-trip for notes/createdAt/updatedAt
   *  it would never look at. */
  dispatch?: DispatchSeed | null;
  /** Create-mode seed from a surface that knows WHO and WHICH DAY but not the
   *  window — today, only the dispatch board's map.
   *
   *  The window is deliberately left unchosen. Every window the board creates
   *  must be one of the tenant's presets, so auto-picking one here would
   *  fabricate a promise to a customer that nobody made — and an undo toast
   *  does not undo a phone call. The general rule the board follows: a drag
   *  commits silently only where the gesture itself carries a time. The
   *  timeline lane does (x is the clock); a map drop carries a person and
   *  nothing else. */
  prefill?: MapPrefill | null;
}

export interface MapPrefill {
  assignedUserId: string;
  /** The date the board is VIEWING, not tomorrow. */
  date: string;
}

// Work items that still want a trip — pre-selected on create.
const NEEDY: ReadonlySet<ProgressCategory> = new Set(['NOT_STARTED', 'AWAITING_SCHEDULE', 'BLOCKED']);

interface Win {
  key: string;
  label: string;
  sh: number;
  sm: number;
  eh: number;
  em: number;
}

// Standard 2-hour arrival windows. Fast, CSR-friendly picking; a non-standard
// existing window is preserved on edit via a synthetic "current" option.
const PRESETS: Win[] = [
  { key: '08-10', label: '8:00 – 10:00 AM', sh: 8, sm: 0, eh: 10, em: 0 },
  { key: '09-11', label: '9:00 – 11:00 AM', sh: 9, sm: 0, eh: 11, em: 0 },
  { key: '10-12', label: '10:00 AM – 12:00 PM', sh: 10, sm: 0, eh: 12, em: 0 },
  { key: '12-14', label: '12:00 – 2:00 PM', sh: 12, sm: 0, eh: 14, em: 0 },
  { key: '14-16', label: '2:00 – 4:00 PM', sh: 14, sm: 0, eh: 16, em: 0 },
  { key: '16-18', label: '4:00 – 6:00 PM', sh: 16, sm: 0, eh: 18, em: 0 },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Every conversion here runs through the TENANT's zone, not the browser's.
// An arrival window of "8–10a" means 8am where the truck is going; built from
// browser-local midnight it lands at whatever hour the offset makes of it,
// and the board — which reads the day back in the tenant's zone — then draws
// it on the wrong row.
function toIso(dateStr: string, h: number, m: number, timeZone: string): string {
  return zonedIso(dateStr, h + m / 60, timeZone);
}

function fmtTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

// Match an existing window to a preset (or build a "current" option for it).
// Takes only the two fields it reads, so it works on a full dispatch and on
// the board row the grid already holds.
function windowFromDispatch(
  d: Pick<Dispatch, 'arrivalWindowStart' | 'arrivalWindowEnd'>,
  timeZone: string,
): { date: string; win: Win } {
  // Read back through the same zone it was written in, or editing a dispatch
  // would silently shift its window by the offset every time it was saved.
  const startHour = zonedHourOf(d.arrivalWindowStart, timeZone) ?? 0;
  const endHour = zonedHourOf(d.arrivalWindowEnd, timeZone) ?? 0;
  const sh = Math.floor(startHour);
  const sm = Math.round((startHour - sh) * 60);
  const eh = Math.floor(endHour);
  const em = Math.round((endHour - eh) * 60);
  const preset = PRESETS.find((w) => w.sh === sh && w.sm === sm && w.eh === eh && w.em === em);
  return {
    date: zonedDateOf(d.arrivalWindowStart, timeZone) ?? localDate(new Date()),
    win: preset ?? {
      key: 'current',
      label: `${fmtTime(startHour)} – ${fmtTime(endHour)}`,
      sh,
      sm,
      eh,
      em,
    },
  };
}

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDate(d);
}

export default function DispatchFormDrawer({
  open,
  onClose,
  workOrderId,
  workItems,
  locationName,
  workOrderNumber,
  dispatch,
  prefill,
}: Props) {
  const { t } = useTranslation();
  // Windows are tenant-local: "8–10a" means 8am where the truck is going.
  const timeZone = useTenantTimeZone();
  const { getName, getAbbrev } = useGlossary();
  const queryClient = useQueryClient();
  const editing = !!dispatch;
  const dispatchWord = getName('dispatch').toLowerCase();
  const techWord = getName('technician').toLowerCase();

  const [assignedUserId, setAssignedUserId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [winKey, setWinKey] = useState(PRESETS[1].key);
  const [addressed, setAddressed] = useState<string[]>([]);
  const [release, setRelease] = useState<'now' | 'deck'>('now');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A non-standard existing window becomes a selectable "current" option.
  const winOptions = useMemo<Win[]>(() => {
    if (editing && dispatch) {
      const { win } = windowFromDispatch(dispatch, timeZone);
      if (win.key === 'current') return [win, ...PRESETS];
    }
    return PRESETS;
  }, [editing, dispatch, timeZone]);

  /* eslint-disable react-hooks/set-state-in-effect -- re-seed transient form state on open (same pattern as the other *FormDialog components). */
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (dispatch) {
      const { date: d, win } = windowFromDispatch(dispatch, timeZone);
      setAssignedUserId(dispatch.assignedUserId);
      setDate(d);
      setWinKey(win.key);
      setAddressed(dispatch.addressedWorkItemIds ?? []);
      // Edit defaults to "hold" + no customer text: we don't re-notify on every
      // save. Switching either on is an explicit release/re-notify action.
      setRelease('deck');
      setNotifyCustomer(false);
    } else if (prefill) {
      setAssignedUserId(prefill.assignedUserId);
      setDate(prefill.date);
      // Empty, not a preset — see `MapPrefill`. `canSave` is false until the
      // dispatcher picks, so the form cannot be submitted with an invented
      // window even by mashing the primary button.
      setWinKey('');
      setAddressed(workItems.filter((wi) => NEEDY.has(wi.statusCategory)).map((wi) => wi.id));
      setRelease('now');
      setNotifyCustomer(true);
    } else {
      setAssignedUserId('');
      setDate(defaultDate());
      setWinKey(PRESETS[1].key);
      setAddressed(workItems.filter((wi) => NEEDY.has(wi.statusCategory)).map((wi) => wi.id));
      setRelease('now');
      setNotifyCustomer(true);
    }
  }, [open, dispatch, prefill, workItems, timeZone]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Field workers only. This is a PICKER, so it must offer exactly who can be
  // assigned — listing every enabled user put admins and CSRs in a
  // "technician" dropdown. Filtered server-side on the resolved answer, so it
  // matches the dispatch board's rows precisely.
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'field-work'],
    queryFn: () => userApi.getFieldWorkers(),
  });
  const techs = useMemo(
    () =>
      [...users]
        .filter((u) => u.enabled)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.trim().localeCompare(`${b.lastName} ${b.firstName}`.trim()),
        ),
    [users],
  );
  // No `?? winOptions[0]` fallback: an unset key means unset, and resolving it
  // to the first preset is exactly the invented promise the map path exists to
  // avoid. `canSave` already gates on this being present.
  const selectedWin = winOptions.find((w) => w.key === winKey) ?? null;
  const blocked = addressed.some((id) => workItems.find((wi) => wi.id === id)?.statusCategory === 'BLOCKED');
  const canSave = !!assignedUserId && !!date && !!selectedWin;

  // Shared with the board's drag writes, so both reach the same caches.
  const invalidate = () => invalidateDispatchConsumers(queryClient, workOrderId);
  const onError = (err: unknown) => {
    // A version conflict isn't a validation failure — the form is fine, the
    // record moved underneath it. Refetch so the next attempt is against
    // current data instead of retrying into the same wall.
    if (isConflict(err) && errorCode(err) === 'DISPATCH_VERSION_CONFLICT') {
      invalidate();
      setError(t('workOrders.dispatches.form.versionConflict', { entity: getName('dispatch') }));
      return;
    }
    const msg =
      err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    setError(msg || t('common.form.errorCreate', { entity: getName('dispatch') }));
  };

  const save = useMutation({
    mutationFn: async () => {
      // Not defensive noise: the map path opens this form with NO window
      // chosen, so an unset window is a reachable state rather than an
      // impossible one. Refusing here means the invariant holds even if a
      // future caller bypasses the disabled button.
      if (!selectedWin) throw new Error('An arrival window must be chosen.');
      const startIso = toIso(date, selectedWin.sh, selectedWin.sm, timeZone);
      const endIso = toIso(date, selectedWin.eh, selectedWin.em, timeZone);
      // One notification path for both create + edit: an explicit, logged
      // notify by audience (never a create/update side effect). Doing the tech
      // notify via /notify — not the create `notifyAssignedUser` flag — so it
      // lands in the notification log + drives the tech-notified timeline step
      // the same way the customer text does.
      const tech = release === 'now';
      const audience = tech && notifyCustomer ? 'BOTH' : tech ? 'TECH' : notifyCustomer ? 'CUSTOMER' : null;
      if (editing && dispatch) {
        await dispatchesApi.update(dispatch.id, {
          assignedUserId,
          arrivalWindowStart: startIso,
          arrivalWindowEnd: endIso,
          addressedWorkItemIds: addressed,
          // The version this form was opened against. Omitting it turns off
          // stale-read detection, and two dispatchers on one board is the
          // normal case, not an edge one.
          version: dispatch.version,
        });
        if (audience) await dispatchesApi.notify(dispatch.id, audience);
      } else {
        const created = await dispatchesApi.create({
          workOrderId,
          assignedUserId,
          arrivalWindowStart: startIso,
          arrivalWindowEnd: endIso,
          addressedWorkItemIds: addressed,
        });
        if (audience) await dispatchesApi.notify(created.id, audience);
      }
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError,
  });

  const cancelDispatch = useMutation({
    mutationFn: () => {
      if (!dispatch) throw new Error('cancel without dispatch');
      return dispatchesApi.update(dispatch.id, {
        status: 'CANCELLED',
        version: dispatch.version,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError,
  });

  const busy = save.isPending || cancelDispatch.isPending;
  const primaryLabel = editing ? 'Save changes' : release === 'now' ? `Schedule ${dispatchWord}` : 'Hold on deck';

  return (
    <SlideOver open={open} onClose={busy ? () => undefined : onClose} className="!max-w-[460px]">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-start gap-2.5 border-b border-border-soft px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-500/15 text-accent-700">
            <CalendarDaysIcon className="size-4" />
          </span>
          <div className="min-w-0 grow">
            <div className="text-[14.5px] font-bold tracking-tight text-fg-strong">
              {editing ? `Edit ${dispatchWord}` : `Schedule ${dispatchWord}`}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-fg-muted">
              {[locationName, workOrderNumber].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Button plain size="xs" onClick={onClose} aria-label={t('common.close')}>
            <XMarkIcon className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="border-b border-border-soft bg-danger-500/10 px-4 py-2 text-[12px] text-danger-600">
              {error}
            </div>
          )}

          {/* Work addressed */}
          <Section title="Work addressed">
            {workItems.length === 0 ? (
              <div className="text-[12px] text-fg-muted">No {getName('work_item', true).toLowerCase()} on this {getName('work_order').toLowerCase()} yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {workItems.map((wi) => {
                  const on = addressed.includes(wi.id);
                  return (
                    <button
                      key={wi.id}
                      type="button"
                      onClick={() =>
                        setAddressed((s) => (s.includes(wi.id) ? s.filter((x) => x !== wi.id) : [...s, wi.id]))
                      }
                      className={[
                        'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
                        on
                          ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent'
                          : 'border-border bg-bg-elev text-fg-muted hover:bg-bg-hover',
                      ].join(' ')}
                    >
                      {on && <CheckIcon className="size-3 shrink-0" />}
                      {wi.sequence != null && (
                        <span className="shrink-0 font-mono text-[10px] opacity-70">
                          {workItemLabel(getAbbrev('work_item'), wi.sequence)}
                        </span>
                      )}
                      <span className="truncate">{wi.description}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {blocked && (
              <div className="mt-2 text-[11px] font-semibold text-warning-600">
                Includes a parts-blocked item — confirm parts have arrived before scheduling.
              </div>
            )}
            {addressed.length === 0 && workItems.length > 0 && (
              <div className="mt-2 text-[11px] text-fg-dim">
                Nothing selected — this {dispatchWord} covers the whole {getName('work_order').toLowerCase()}.
              </div>
            )}
          </Section>

          {/* When */}
          <Section title="When">
            <div className="flex gap-2.5">
              <label className="flex-1">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
                  Date
                </span>
                <input
                  type="date"
                  aria-label="Date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-[34px] w-full rounded-sm border border-border bg-bg px-2.5 !text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
                />
              </label>
              <label className="flex-[1.2]">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
                  Arrival window
                </span>
                <select
                  aria-label="Arrival window"
                  value={winKey}
                  onChange={(e) => setWinKey(e.target.value)}
                  className="h-[34px] w-full rounded-sm border border-border bg-bg px-2.5 !text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
                >
                  {/* Only present while nothing is chosen, and it cannot be
                      re-selected once a window is: an empty option that stays
                      in the list reads as a valid answer. */}
                  {!winKey && <option value="">{t('common.form.select')}</option>}
                  {winOptions.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {prefill && !winKey && (
              <p className="mt-1.5 text-[11px] leading-snug text-fg-muted">
                {t('dispatchBoard.map.windowUnset')}
              </p>
            )}
          </Section>

          {/* Assign tech */}
          <Section title={`Assign ${techWord}`}>
            {/* Says where the selection came from. A picker that arrives
                pre-answered with no explanation reads as a bug. */}
            {prefill && (
              <Pill tone="info" className="mb-2">
                {t('dispatchBoard.map.prefilledTech')}
              </Pill>
            )}
            <TechPicker techs={techs} value={assignedUserId} onChange={setAssignedUserId} techWord={techWord} />
            {!assignedUserId && (
              <div className="mt-1.5 text-[11px] text-fg-dim">
                A {techWord} is required — an unassigned {dispatchWord} is just unscheduled work.
              </div>
            )}
          </Section>

          {/* Release — the on-deck decision */}
          <Section title="Release">
            <div className="flex overflow-hidden rounded-md border border-border">
              {(
                [
                  { id: 'now', label: `Notify ${techWord} now`, sub: 'Dispatch immediately' },
                  { id: 'deck', label: 'Hold on deck', sub: 'Assign, notify later' },
                ] as const
              ).map((o, i) => {
                const on = release === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setRelease(o.id)}
                    className={[
                      'flex-1 px-1.5 py-2 text-center',
                      i === 0 ? 'border-r border-border' : '',
                      on ? 'bg-accent-500/12 text-fg-accent' : 'text-fg-muted',
                    ].join(' ')}
                  >
                    <div className="text-[12.5px] font-semibold">{o.label}</div>
                    <div className={`mt-0.5 text-[10.5px] ${on ? 'text-fg-accent' : 'text-fg-dim'}`}>{o.sub}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10.5px] leading-snug text-fg-dim">
              {release === 'now'
                ? `The ${techWord} is notified and the ${dispatchWord} enters their queue now.`
                : `Scheduled and assigned, but the ${techWord} isn’t notified yet — release it when ready.`}
            </div>
          </Section>

          {/* Customer — text the customer their arrival window. Explicit,
              logged send (POST /notify?audience=CUSTOMER after save); the
              backend respects the customer's per-type SMS opt-in. */}
          <Section title="Customer" last>
            <button
              type="button"
              role="switch"
              aria-checked={notifyCustomer}
              onClick={() => setNotifyCustomer((v) => !v)}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="min-w-0 grow">
                <div className="text-[12.5px] font-semibold text-fg-strong">Text the customer</div>
                <div className="text-[11px] text-fg-muted">Send the customer the date + arrival window</div>
              </div>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${notifyCustomer ? 'bg-accent-500' : 'bg-bg-active'}`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${notifyCustomer ? 'left-[18px]' : 'left-0.5'}`}
                />
              </span>
            </button>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-4 py-2.5">
          {editing && dispatch && dispatch.status !== 'CANCELLED' && (
            <Button
              plain
              size="xs"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
              style={{ color: 'var(--danger-600)' }}
            >
              {`Cancel ${dispatchWord}`}
            </Button>
          )}
          <span className="grow" />
          <Button plain size="xs" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" size="xs" disabled={!canSave || busy} onClick={() => canSave && save.mutate()}>
            {save.isPending ? t('common.saving') : primaryLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelDispatch.mutate()}
        title={`Cancel ${dispatchWord}?`}
        message="It stays on the record for audit."
        confirmLabel={`Cancel ${dispatchWord}`}
        cancelLabel={`Keep ${dispatchWord}`}
        isDestructive
        isPending={cancelDispatch.isPending}
      />
    </SlideOver>
  );
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section className={`px-4 py-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <div className="mb-2">
        <span className="label-tiny text-fg">{title}</span>
      </div>
      {children}
    </section>
  );
}

const techName = (u: User) => `${u.firstName} ${u.lastName}`.trim() || u.email;
// Real, non-fabricated secondary line: the tech's primary role. (Distance /
// last-serviced / best-fit would need a ranking backend — deferred.)
const techMeta = (u: User) => u.roles?.[0]?.name ?? undefined;

// Searchable technician picker: avatar-led trigger + a search-and-list panel,
// matching the compose mock. Rows render in the DOM (unlike a virtualized
// combobox), so it's driveable in tests.
function TechPicker({
  techs,
  value,
  onChange,
  techWord,
}: {
  techs: User[];
  value: string;
  onChange: (id: string) => void;
  techWord: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = techs.find((u) => u.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = q.trim()
    ? techs.filter((u) => techName(u).toLowerCase().includes(q.trim().toLowerCase()))
    : techs;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={techWord}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex min-h-[44px] w-full items-center gap-2.5 rounded-sm border bg-bg px-2.5 text-left',
          open ? 'border-accent-500' : 'border-border hover:border-border-strong',
        ].join(' ')}
      >
        {selected ? (
          <>
            <Avatar name={techName(selected)} size="sm" />
            <div className="min-w-0 grow">
              <div className="truncate text-[12.5px] font-semibold text-fg-strong">{techName(selected)}</div>
              {techMeta(selected) && <div className="truncate text-[11px] text-fg-muted">{techMeta(selected)}</div>}
            </div>
          </>
        ) : (
          <span className="grow text-[12.5px] text-fg-muted">Choose a {techWord}…</span>
        )}
        <ChevronUpDownIcon className="size-4 shrink-0 text-fg-muted" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-md border border-border bg-bg-elev shadow-lg">
          <div className="border-b border-border-soft p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${techWord}s…`}
              aria-label={`Search ${techWord}s`}
              className="h-8 w-full rounded-sm border border-border bg-bg px-2.5 !text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
            />
          </div>
          <div role="listbox" className="max-h-[240px] overflow-y-auto">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={u.id === value}
                onClick={() => {
                  onChange(u.id);
                  setOpen(false);
                  setQ('');
                }}
                className="flex w-full items-center gap-2.5 border-b border-border-soft px-2.5 py-2 text-left last:border-b-0 hover:bg-bg-hover aria-selected:bg-accent-500/8"
              >
                <Avatar name={techName(u)} size="sm" />
                <div className="min-w-0 grow">
                  <div className="truncate text-[12.5px] font-semibold text-fg-strong">{techName(u)}</div>
                  {techMeta(u) && <div className="truncate text-[11px] text-fg-muted">{techMeta(u)}</div>}
                </div>
                {u.id === value && <CheckIcon className="size-4 shrink-0 text-fg-accent" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[12px] text-fg-muted">No {techWord}s match “{q}”.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
