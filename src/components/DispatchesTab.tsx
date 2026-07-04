import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderFilesApi,
  type Dispatch,
  type DispatchBoardRow,
  type DispatchStatus,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Avatar } from './ui/Avatar';
import { Pill } from './ui/Pill';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { PlusIcon, PlayIcon } from '@heroicons/react/24/solid';

// ── Dispatches tab — one card per dispatch (the designer's "Trips" view; the
// tenant-facing word is glossary-driven via getName('dispatch')). Live-first.
// Scheduling + lifecycle reuse the existing dispatch surfaces: "+ Schedule" →
// AssignTechnicianDialog (onAssign), card → DispatchDetailDrawer (onSelect),
// live "Reschedule" → onEdit.
//
// Degraded vs. the mock (backend-deferred): no mini-map / ETA progress bar
// (no GPS signal), no addressed-item tags (no dispatch↔work-item linkage yet),
// no per-dispatch collected $ (not exposed). Photo/video counts + thumbnails
// are DERIVED from the media graph by `dispatchId` (never a stored count).

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

function firstNameLastInitial(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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

  const visible = useMemo(() => dispatches.filter((d) => d.status !== 'CANCELLED'), [dispatches]);
  const ordered = useMemo(
    () =>
      [...visible].sort((a, b) => {
        const rank = (d: DispatchBoardRow) =>
          isLive(d.status) ? 0 : d.status === 'COMPLETED' ? 2 : 1;
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const ta = new Date(a.arrivalWindowStart).getTime();
        const tb = new Date(b.arrivalWindowStart).getTime();
        return ra === 2 ? tb - ta : ta - tb; // completed: most recent first; else soonest first
      }),
    [visible]
  );

  // Per-dispatch photo/video counts derive from the media graph keyed by
  // dispatchId. Only fetched when there are dispatches to attribute media to.
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
        ordered.map((d) =>
          isLive(d.status) ? (
            <LiveDispatchCard
              key={d.id}
              d={d}
              media={visualsByDispatch.get(d.id) ?? []}
              readOnly={readOnly}
              onEdit={onEdit}
              onSelect={onSelect}
            />
          ) : (
            <DispatchCard key={d.id} d={d} media={visualsByDispatch.get(d.id) ?? []} onSelect={onSelect} />
          )
        )
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

function MediaStrip({ media }: { media: WorkOrderFile[] }) {
  const { t } = useTranslation();
  if (media.length === 0) return null;
  const photos = media.filter((m) => m.kind === 'PHOTO').length;
  const videos = media.filter((m) => m.kind === 'VIDEO').length;
  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-fg-muted">
        {photos > 0 && <span>{t('workOrders.dispatches.photoCount', { count: photos })}</span>}
        {videos > 0 && <span>{t('workOrders.dispatches.videoCount', { count: videos })}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {media.slice(0, 6).map((m) => (
          <div
            key={m.id}
            className="relative size-12 shrink-0 overflow-hidden rounded-sm border border-border bg-bg-elev-2"
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
    </div>
  );
}

function DispatchCard({
  d,
  media,
  onSelect,
}: {
  d: DispatchBoardRow;
  media: WorkOrderFile[];
  onSelect: (d: Dispatch) => void;
}) {
  const accent =
    d.status === 'COMPLETED' ? 'var(--success-500)' : d.status === 'NO_SHOW' ? 'var(--warning-500)' : 'var(--info-500)';
  return (
    <button
      type="button"
      onClick={() => onSelect(d)}
      className="block w-full cursor-pointer rounded-lg border border-border bg-bg-elev px-3.5 py-3 text-left hover:bg-bg-hover"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <StatusPill d={d} />
        <span className="text-[12.5px] font-medium text-fg-strong">{formatWindow(d.arrivalWindowStart, d.arrivalWindowEnd)}</span>
        <span className="flex-1" />
        {d.assignedUserName && (
          <span className="flex items-center gap-1.5">
            <Avatar name={d.assignedUserName} size="sm" />
            <span className="text-[12px] text-fg-strong">{firstNameLastInitial(d.assignedUserName)}</span>
          </span>
        )}
      </div>
      {d.notes && <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{d.notes}</div>}
      <MediaStrip media={media} />
    </button>
  );
}

function LiveDispatchCard({
  d,
  media,
  readOnly,
  onEdit,
  onSelect,
}: {
  d: DispatchBoardRow;
  media: WorkOrderFile[];
  readOnly: boolean;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg border px-3.5 py-3"
      style={{
        borderColor: 'color-mix(in oklch, var(--violet-500) 35%, var(--border))',
        background: 'color-mix(in oklch, var(--violet-500) 6%, var(--bg-elev))',
        borderLeft: '3px solid var(--violet-500)',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <StatusPill d={d} />
        <span className="text-[12.5px] font-medium text-fg-strong">{formatWindow(d.arrivalWindowStart, d.arrivalWindowEnd)}</span>
        <span className="flex-1" />
        {d.assignedUserName && (
          <span className="flex items-center gap-1.5">
            <Avatar name={d.assignedUserName} size="sm" />
            <span className="text-[12px] text-fg-strong">{firstNameLastInitial(d.assignedUserName)}</span>
          </span>
        )}
      </div>
      {/* No live map / ETA bar — there's no GPS signal; lead with self-reported status. */}
      <div className="mt-1.5 text-[12px] text-fg-muted">{t('workOrders.dispatches.liveSelfReported')}</div>
      {d.notes && <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{d.notes}</div>}
      <MediaStrip media={media} />
      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex-1" />
        <Button plain onClick={() => onSelect(d)}>
          {t('workOrders.dispatches.viewDetails')}
        </Button>
        {!readOnly && (
          <Button outline onClick={() => onEdit(d)}>
            {t('workOrders.dispatches.reschedule')}
          </Button>
        )}
      </div>
    </div>
  );
}
