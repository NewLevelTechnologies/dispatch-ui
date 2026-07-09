import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  dispatchesApi,
  workOrderFilesApi,
  type Dispatch,
  type DispatchBoardRow,
  type DispatchStatus,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Avatar } from './ui/Avatar';
import { Pill, Tag } from './ui/Pill';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { PlusIcon, PlayIcon } from '@heroicons/react/24/solid';

// ── Dispatches tab — one card per dispatch, built to the designer's Trips-tab
// mock (screen-wo-detail-tabs.jsx). Live-first ordering. Each card's head is
// the click target → opens the detail drawer (onSelect). "+ Schedule" →
// DispatchFormDrawer (onAssign); live "Reschedule" → onEdit; live
// Mark-on-site/Complete advance the status directly.
//
// Card head = seq badge + "{Dispatch} N · label" + status pill + window +
// addressed-work-item count + Details→. Body = tech + derived photo/video
// counts + notes + derived media thumbnails.
//
// Degraded vs. the mock (backend-deferred): no mini-map / ETA progress bar (no
// GPS signal), no per-dispatch collected $ or parts-blocked flag (not exposed).
// Photo/video counts + thumbnails are DERIVED from the media graph by
// `dispatchId`; the seq is derived from the arrival-ordered list.

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

const PRESENTATION: Record<DispatchStatus, { tone: PillTone; live?: boolean }> = {
  SCHEDULED: { tone: 'info' },
  EN_ROUTE: { tone: 'violet', live: true },
  IN_PROGRESS: { tone: 'violet', live: true },
  COMPLETED: { tone: 'success' },
  NO_SHOW: { tone: 'warning' },
  CANCELLED: { tone: 'neutral' },
};

// En route + on site are both "live now" (drive live-first ordering + the live card).
const isLive = (s: DispatchStatus) => s === 'EN_ROUTE' || s === 'IN_PROGRESS';

const ETA_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const ETA_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)}–${ETA_TIME.format(end)}`;
  return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)} – ${ETA_DATE.format(end)} ${ETA_TIME.format(end)}`;
}

interface Props {
  workOrderId: string;
  dispatches: DispatchBoardRow[];
  readOnly?: boolean;
  onAssign: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
}

export default function DispatchesTab({ workOrderId, dispatches, readOnly = false, onAssign, onEdit, onSelect }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const visible = useMemo(() => dispatches.filter((d) => d.status !== 'CANCELLED'), [dispatches]);
  const ordered = useMemo(
    () =>
      [...visible].sort((a, b) => {
        const rank = (d: DispatchBoardRow) => (isLive(d.status) ? 0 : d.status === 'COMPLETED' ? 2 : 1);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const ta = new Date(a.arrivalWindowStart).getTime();
        const tb = new Date(b.arrivalWindowStart).getTime();
        return ra === 2 ? tb - ta : ta - tb; // completed: most recent first; else soonest first
      }),
    [visible]
  );

  // Trip seq — 1-indexed by arrival, matching the drawer's derivation.
  const seqById = useMemo(() => {
    const chrono = [...visible].sort(
      (a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime(),
    );
    const m = new Map<string, number>();
    chrono.forEach((d, i) => m.set(d.id, i + 1));
    return m;
  }, [visible]);

  // Per-dispatch photo/video counts + thumbnails derive from the media graph
  // keyed by dispatchId. Only fetched when there are dispatches.
  const { data: filesPage } = useQuery({
    queryKey: ['work-order-files', workOrderId, 'dispatch-media'],
    queryFn: () => workOrderFilesApi.list(workOrderId, { limit: 100 }),
    enabled: visible.length > 0,
  });
  const visualsByDispatch = useMemo(() => {
    const map = new Map<string, WorkOrderFile[]>();
    for (const f of filesPage?.content ?? []) {
      if (!f.dispatchId || (f.kind !== 'PHOTO' && f.kind !== 'VIDEO')) continue;
      const arr = map.get(f.dispatchId) ?? [];
      arr.push(f);
      map.set(f.dispatchId, arr);
    }
    return map;
  }, [filesPage]);

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DispatchStatus }) => dispatchesApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.drawer.statusError', { entity: getName('dispatch') }));
    },
  });

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <Button outline className="self-start" onClick={onAssign}>
          <PlusIcon data-slot="icon" />
          {t('workOrders.dispatches.schedule', { entity: getName('dispatch') })}
        </Button>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Text tone="muted">{t('common.actions.noEntitiesYet', { entities: getName('dispatch', true) })}</Text>
        </div>
      ) : (
        ordered.map((d) => (
          <DispatchCard
            key={d.id}
            d={d}
            seq={seqById.get(d.id) ?? 0}
            media={visualsByDispatch.get(d.id) ?? []}
            readOnly={readOnly}
            onEdit={onEdit}
            onSelect={onSelect}
            onAdvance={(dispatch, status) => advance.mutate({ id: dispatch.id, status })}
            advancing={advance.isPending}
          />
        ))
      )}
    </div>
  );
}

function StatusPill({ d }: { d: DispatchBoardRow }) {
  const { t } = useTranslation();
  const p = PRESENTATION[d.status];
  // IN_PROGRESS reads "On site" (self-reported) to match the overview strip;
  // other states use the shared dispatch status labels.
  const label =
    d.status === 'IN_PROGRESS' ? t('workOrders.dispatches.onSite') : t(`workOrders.dispatches.status.${d.status}`);
  return (
    <Pill tone={p.tone} dot live={p.live}>
      {label}
    </Pill>
  );
}

// Clickable card head → opens the detail drawer. Seq badge + "{Dispatch} N ·
// label" + status pill, then window + addressed-item count + Details→.
function TripHead({ d, seq, onSelect }: { d: DispatchBoardRow; seq: number; onSelect: (d: Dispatch) => void }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const p = PRESENTATION[d.status];
  const done = d.status === 'COMPLETED';
  const badge = done
    ? { background: 'color-mix(in oklch, var(--success-500) 14%, var(--bg-elev))', color: 'var(--success-500)' }
    : p.live
      ? { background: 'color-mix(in oklch, var(--violet-500) 16%, var(--bg-elev))', color: 'var(--violet-500)' }
      : { background: 'color-mix(in oklch, var(--info-500) 14%, var(--bg-elev))', color: 'var(--info-500)' };
  const addressed = d.addressedWorkItemIds ?? [];
  return (
    <button
      type="button"
      onClick={() => onSelect(d)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-left hover:bg-bg-hover"
      style={p.live ? { background: 'color-mix(in oklch, var(--violet-500) 6%, var(--bg-elev))' } : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-md text-[11px] font-bold" style={badge}>
          {done ? '✓' : seq}
        </span>
        <span className="truncate text-[13px] font-semibold text-fg-strong">
          {d.label ? `${getName('dispatch')} ${seq} · ${d.label}` : `${getName('dispatch')} ${seq}`}
        </span>
        <StatusPill d={d} />
      </div>
      <span className="flex-1" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-[11.5px] text-fg-muted">
          {formatWindow(d.arrivalWindowStart, d.arrivalWindowEnd)}
        </span>
        {addressed.length > 0 && (
          <Tag>{`${addressed.length} ${getName('work_item', addressed.length !== 1).toLowerCase()}`}</Tag>
        )}
        <span className="whitespace-nowrap text-[11.5px] font-semibold text-fg-accent">
          {t('workOrders.dispatches.viewDetails')} →
        </span>
      </div>
    </button>
  );
}

function MediaThumbs({ media }: { media: WorkOrderFile[] }) {
  if (media.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {media.slice(0, 8).map((m) => (
        <div
          key={m.id}
          className="relative size-14 shrink-0 overflow-hidden rounded-sm border border-border bg-bg-elev-2"
          title={m.caption ?? m.fileName}
        >
          {m.thumbnailUrl || m.kind === 'PHOTO' ? (
            <img src={m.thumbnailUrl ?? m.url} alt={m.caption ?? m.fileName} className="size-full object-cover" />
          ) : null}
          {m.kind === 'VIDEO' && (
            <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
              <PlayIcon className="size-4" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DispatchCard({
  d,
  seq,
  media,
  readOnly,
  onEdit,
  onSelect,
  onAdvance,
  advancing,
}: {
  d: DispatchBoardRow;
  seq: number;
  media: WorkOrderFile[];
  readOnly: boolean;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
  onAdvance: (dispatch: Dispatch, status: DispatchStatus) => void;
  advancing: boolean;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const live = isLive(d.status);
  const photos = media.filter((m) => m.kind === 'PHOTO').length;
  const videos = media.filter((m) => m.kind === 'VIDEO').length;
  // Live transition: en route → on site, on site → complete.
  const primary =
    d.status === 'EN_ROUTE'
      ? { label: t('workOrders.dispatches.drawer.markOnSite'), next: 'IN_PROGRESS' as DispatchStatus }
      : { label: t('workOrders.dispatches.drawer.completeVisit', { entity: getName('dispatch') }), next: 'COMPLETED' as DispatchStatus };

  return (
    <div
      className="overflow-hidden rounded-lg border bg-bg-elev"
      style={live ? { borderColor: 'color-mix(in oklch, var(--violet-500) 35%, var(--border))' } : { borderColor: 'var(--border)' }}
    >
      <TripHead d={d} seq={seq} onSelect={onSelect} />
      <div className="border-t border-border-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          {d.assignedUserName && <Avatar name={d.assignedUserName} size="sm" />}
          <span className="font-semibold text-fg-strong">{d.assignedUserName ?? '—'}</span>
          {photos > 0 && <span className="text-fg-muted">· {t('workOrders.dispatches.photoCount', { count: photos })}</span>}
          {videos > 0 && <span className="text-fg-muted">· {t('workOrders.dispatches.videoCount', { count: videos })}</span>}
        </div>

        {/* No live map / ETA bar — there's no GPS signal; lead with self-reported status. */}
        {live && <div className="mt-1.5 text-[12px] text-fg-muted">{t('workOrders.dispatches.liveSelfReported')}</div>}

        {d.notes && <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{d.notes}</div>}

        <MediaThumbs media={media} />

        {live && !readOnly && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="flex-1" />
            <Button plain onClick={() => onEdit(d)}>
              {t('workOrders.dispatches.reschedule')}
            </Button>
            <Button color="accent" disabled={advancing} onClick={() => onAdvance(d, primary.next)}>
              {primary.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
