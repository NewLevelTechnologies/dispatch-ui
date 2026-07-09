/* eslint-disable i18next/no-literal-string -- dense operational composer; short scheduling labels stay literal (same convention as WorkOrderFileUploadDialog / WorkOrderFilesTab). Entity names still route through getName(). */
// Dispatch create / edit — the compose+edit counterpart to the read-only trip
// drawer (DispatchDetailDrawer). Same right-side SlideOver chrome, so scheduling
// or editing a dispatch feels like the same object you view. Replaces the legacy
// AssignTechnicianDialog. Sections: Work addressed → When → Assign tech → Release.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDaysIcon, CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  dispatchesApi,
  userApi,
  type Dispatch,
  type ProgressCategory,
  type User,
  type WorkItemResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { SlideOver } from './catalyst/slideover';
import { Button } from './catalyst/button';
import { Avatar } from './ui/Avatar';

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workItems: WorkItemResponse[];
  locationName?: string;
  workOrderNumber?: string;
  // Present = edit mode (prefilled); absent = create.
  dispatch?: Dispatch | null;
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

function toIso(dateStr: string, h: number, m: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).toISOString();
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Match an existing window to a preset (or build a "current" option for it).
function windowFromDispatch(d: Dispatch): { date: string; win: Win } {
  const start = new Date(d.arrivalWindowStart);
  const end = new Date(d.arrivalWindowEnd);
  const sh = start.getHours();
  const sm = start.getMinutes();
  const eh = end.getHours();
  const em = end.getMinutes();
  const preset = PRESETS.find((w) => w.sh === sh && w.sm === sm && w.eh === eh && w.em === em);
  return {
    date: localDate(start),
    win: preset ?? { key: 'current', label: `${fmtTime(start)} – ${fmtTime(end)}`, sh, sm, eh, em },
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
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
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
  const [error, setError] = useState<string | null>(null);

  // A non-standard existing window becomes a selectable "current" option.
  const winOptions = useMemo<Win[]>(() => {
    if (editing && dispatch) {
      const { win } = windowFromDispatch(dispatch);
      if (win.key === 'current') return [win, ...PRESETS];
    }
    return PRESETS;
  }, [editing, dispatch]);

  /* eslint-disable react-hooks/set-state-in-effect -- re-seed transient form state on open (same pattern as the other *FormDialog components). */
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (dispatch) {
      const { date: d, win } = windowFromDispatch(dispatch);
      setAssignedUserId(dispatch.assignedUserId);
      setDate(d);
      setWinKey(win.key);
      setAddressed(dispatch.addressedWorkItemIds ?? []);
      // Edit defaults to "hold" + no customer text: we don't re-notify on every
      // save. Switching either on is an explicit release/re-notify action.
      setRelease('deck');
      setNotifyCustomer(false);
    } else {
      setAssignedUserId('');
      setDate(defaultDate());
      setWinKey(PRESETS[1].key);
      setAddressed(workItems.filter((wi) => NEEDY.has(wi.statusCategory)).map((wi) => wi.id));
      setRelease('now');
      setNotifyCustomer(true);
    }
  }, [open, dispatch, workItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const techs = useMemo(
    () =>
      [...users]
        .filter((u) => u.enabled)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.trim().localeCompare(`${b.lastName} ${b.firstName}`.trim()),
        ),
    [users],
  );
  const selectedWin = winOptions.find((w) => w.key === winKey) ?? winOptions[0];
  const blocked = addressed.some((id) => workItems.find((wi) => wi.id === id)?.statusCategory === 'BLOCKED');
  const canSave = !!assignedUserId && !!date && !!selectedWin;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    queryClient.invalidateQueries({ queryKey: ['dispatch'] });
    queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['location-tech'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
  };
  const onError = (err: unknown) => {
    const msg =
      err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    setError(msg || t('common.form.errorCreate', { entity: getName('dispatch') }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const startIso = toIso(date, selectedWin.sh, selectedWin.sm);
      const endIso = toIso(date, selectedWin.eh, selectedWin.em);
      if (editing && dispatch) {
        await dispatchesApi.update(dispatch.id, {
          assignedUserId,
          arrivalWindowStart: startIso,
          arrivalWindowEnd: endIso,
          addressedWorkItemIds: addressed,
        });
        // Notify as an explicit, logged action (never a side effect of the
        // write): release the tech ("now") and/or text the customer their
        // window. Fold into one call by audience.
        const tech = release === 'now';
        const audience = tech && notifyCustomer ? 'BOTH' : tech ? 'TECH' : notifyCustomer ? 'CUSTOMER' : null;
        if (audience) await dispatchesApi.notify(dispatch.id, audience);
      } else {
        // Tech SMS rides the create flag; the customer text is a follow-up
        // notify on the new dispatch (respects the customer's per-type opt-in).
        const created = await dispatchesApi.create({
          workOrderId,
          assignedUserId,
          arrivalWindowStart: startIso,
          arrivalWindowEnd: endIso,
          addressedWorkItemIds: addressed,
          notifyAssignedUser: release === 'now',
        });
        if (notifyCustomer) await dispatchesApi.notify(created.id, 'CUSTOMER');
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
      return dispatchesApi.update(dispatch.id, { status: 'CANCELLED' });
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
                  className="h-[34px] w-full rounded-sm border border-border bg-bg px-2.5 text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
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
                  className="h-[34px] w-full rounded-sm border border-border bg-bg px-2.5 text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
                >
                  {winOptions.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Section>

          {/* Assign tech */}
          <Section title={`Assign ${techWord}`}>
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
              onClick={() => {
                if (window.confirm(`Cancel this ${dispatchWord}? It stays on the record for audit.`)) {
                  cancelDispatch.mutate();
                }
              }}
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
              className="h-8 w-full rounded-sm border border-border bg-bg px-2.5 text-[12.5px] text-fg-strong outline-none focus:border-accent-500"
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
