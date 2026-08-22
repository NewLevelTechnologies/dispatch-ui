import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  dispatchNotesApi,
  dispatchesApi,
  workOrderFilesApi,
  type Dispatch,
  type DispatchBoardRow,
  type DispatchStatus,
  type WorkItemResponse,
  type WorkOrderFile,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Avatar } from './ui/Avatar';
import { Pill, Tag } from './ui/Pill';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { FileLightbox } from './WorkOrderFilesTab';
import { workItemLabel } from '../utils/workItemLabel';
import { PlusIcon, PlayIcon } from '@heroicons/react/24/solid';
import { MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';

// ── Dispatches tab — one card per dispatch, built to the designer's Trips-tab
// mock (screen-wo-detail-tabs.jsx: TripCard / LiveTripCard / TripHead). The
// card and the detail drawer are the same object at two densities. Live-first
// ordering. The card head is the click target → opens the detail drawer
// (onSelect). "+ Schedule" → DispatchFormDrawer (onAssign).
//
// Head  = seq badge (✓ when done) + "{Dispatch} N · label" + status pill +
//         window + addressed work-item chips (WI-02) + Details→.
// Body  = tech + derived photo/video counts + parts-blocked flag + the visit
//         note + tap-to-enlarge media thumbnails.
// Footer (mirrors the drawer, on EVERY card): Scheduled/live → [Edit dispatch]
//         + the one next-step transition (Mark en route → on site → complete);
//         Completed → "Completed {time}" + [View invoice →].
// Live card (en route / on site) reads differently: a violet status strip with
//         the self-reported status + committed-window ETA fallback.
//
// Degraded vs. the mock (backend-deferred): no GPS mini-map / live-ETA bar (no
// location signal — the strip shows the self-reported fallback instead), and
// no per-dispatch collected-$ (payments aren't linked to a visit). Photo/video
// counts + thumbnails DERIVE from the media graph keyed by dispatchId; the seq
// derives from the arrival-ordered list; parts-blocked + WI chips derive from
// the addressed work items.

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

// m:ss video-duration badge (matches the Files-tab tiles).
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const MONTH_DAY_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
// Live-strip time — "6:55 PM" when it's today, "Jul 9, 6:55 PM" when the day
// differs (a visit that spans past today, so the date starts to matter).
function etaTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? ETA_TIME.format(d) : `${MONTH_DAY_SHORT.format(d)}, ${ETA_TIME.format(d)}`;
}

interface Props {
  workOrderId: string;
  dispatches: DispatchBoardRow[];
  /** WO work items, used to resolve addressed ids → chip labels (WI-02) and to
   *  derive the parts-blocked flag. Optional; the card degrades to a count. */
  workItems?: WorkItemResponse[];
  readOnly?: boolean;
  onAssign: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
  /** Navigate to the WO's money documents (there's no per-dispatch invoice link);
   *  drives "View invoice →" on completed cards. Optional. */
  onViewInvoice?: () => void;
}

export default function DispatchesTab({
  workOrderId,
  dispatches,
  workItems,
  readOnly = false,
  onAssign,
  onEdit,
  onSelect,
  onViewInvoice,
}: Props) {
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

  // Addressed ids → work item, for chip labels + the parts-blocked flag.
  const workItemById = useMemo(() => {
    const m = new Map<string, WorkItemResponse>();
    for (const wi of workItems ?? []) m.set(wi.id, wi);
    return m;
  }, [workItems]);

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
        <Button
          outline
          // outline is transparent in light mode → it washes into the page grey.
          // Sit it on the card fill (--bg-elev), like the mock's .btn, in both themes.
          className="self-start shadow-sm"
          style={{ backgroundColor: 'var(--bg-elev)' }}
          onClick={onAssign}
        >
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
            workItemById={workItemById}
            readOnly={readOnly}
            onEdit={onEdit}
            onSelect={onSelect}
            onAdvance={(dispatch, status) => advance.mutate({ id: dispatch.id, status })}
            advancing={advance.isPending}
            onViewInvoice={onViewInvoice}
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
// label" + status pill, then window + addressed-item chips + Details→.
function TripHead({
  d,
  seq,
  workItemById,
  onSelect,
}: {
  d: DispatchBoardRow;
  seq: number;
  workItemById: Map<string, WorkItemResponse>;
  onSelect: (d: Dispatch) => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const p = PRESENTATION[d.status];
  const done = d.status === 'COMPLETED';
  const badge = done
    ? { background: 'color-mix(in oklch, var(--success-500) 14%, var(--bg-elev))', color: 'var(--success-500)' }
    : p.live
      ? { background: 'color-mix(in oklch, var(--violet-500) 16%, var(--bg-elev))', color: 'var(--violet-500)' }
      : { background: 'color-mix(in oklch, var(--info-500) 14%, var(--bg-elev))', color: 'var(--info-500)' };

  // Addressed work-item chips (WI-02). Resolve ids → sequence via the WO items;
  // fall back to a count when items aren't available (e.g. summary surfaces).
  const addressedIds = d.addressedWorkItemIds ?? [];
  const abbrev = getAbbrev('work_item');
  const resolved = addressedIds
    .map((id) => workItemById.get(id))
    .filter((wi): wi is WorkItemResponse => !!wi && wi.sequence != null);
  const shownChips = resolved.slice(0, 3);
  const extraChips = resolved.length - shownChips.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(d)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-left hover:bg-bg-hover"
      style={p.live ? { background: 'color-mix(in oklch, var(--violet-500) 11%, var(--bg-elev))' } : undefined}
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
        {resolved.length > 0 ? (
          <span className="flex items-center gap-1">
            {shownChips.map((wi) => (
              <Tag key={wi.id}>{workItemLabel(abbrev, wi.sequence!)}</Tag>
            ))}
            {extraChips > 0 && <Tag>{`+${extraChips}`}</Tag>}
          </span>
        ) : (
          addressedIds.length > 0 && (
            <Tag>{`${addressedIds.length} ${getName('work_item', addressedIds.length !== 1).toLowerCase()}`}</Tag>
          )
        )}
        <span className="whitespace-nowrap text-[11.5px] font-semibold text-fg-accent">
          {t('workOrders.dispatches.viewDetails')} →
        </span>
      </div>
    </button>
  );
}

// Tap-to-enlarge media strip — thumbnails open the shared fullscreen viewer
// (same as the Files tab / drawer). Video tiles carry a duration badge;
// Before/After-tagged captures carry their label.
function MediaThumbs({ media, onOpen }: { media: WorkOrderFile[]; onOpen: (index: number) => void }) {
  const { t } = useTranslation();
  if (media.length === 0) return null;
  const shown = media.slice(0, 8);
  const overflow = media.length - shown.length;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {shown.map((m, i) => {
        // Best available label for the tile: the Before/After capture tag, else
        // the file's caption. (There's no "nameplate" flag on the file model.)
        const label =
          m.captureTag != null
            ? t(
                m.captureTag === 'BEFORE'
                  ? 'workOrders.dispatches.drawer.captureBefore'
                  : 'workOrders.dispatches.drawer.captureAfter',
              )
            : m.caption;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(i)}
            className="group relative size-14 shrink-0 overflow-hidden rounded-sm border border-border bg-bg-elev-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
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
            {/* Obvious tap-to-enlarge affordance — magnifier on hover/focus. */}
            <span className="absolute inset-0 hidden place-items-center bg-black/45 text-white group-hover:grid group-focus-visible:grid">
              <MagnifyingGlassPlusIcon className="size-5" />
            </span>
            {label && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1 pb-0.5 pt-2.5 text-left text-[8.5px] font-semibold leading-none text-white">
                {label}
              </span>
            )}
            {m.kind === 'VIDEO' && m.durationSeconds != null && (
              <span className="absolute bottom-0.5 right-0.5 rounded-[3px] bg-black/70 px-1 text-[8.5px] font-semibold leading-tight text-white">
                {formatDuration(m.durationSeconds)}
              </span>
            )}
          </button>
        );
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => onOpen(shown.length)}
          className="grid size-14 shrink-0 place-items-center rounded-sm border border-border bg-bg-elev-2 text-[11px] font-semibold text-fg-muted hover:bg-bg-hover"
        >
          {`+${overflow}`}
        </button>
      )}
    </div>
  );
}

// Violet status strip for en-route / on-site visits — the no-GPS fallback:
// self-reported status + the committed arrival-window ETA. Reads distinctly
// from the calm cards without fabricating a live map / progress bar.
function LiveStatusStrip({ d }: { d: DispatchBoardRow }) {
  const { t } = useTranslation();
  const primaryLine =
    d.status === 'EN_ROUTE'
      ? `${t('workOrders.dispatches.status.EN_ROUTE')} · ${t('workOrders.dispatches.arrivingBy', {
          time: etaTimeLabel(d.arrivalWindowEnd),
        })}`
      : d.arrivedAt
        ? t('workOrders.dispatches.onSiteSince', { time: etaTimeLabel(d.arrivedAt) })
        : t('workOrders.dispatches.onSite');
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--violet-500)' }}>
        <span
          className="size-[7px] shrink-0 rounded-full"
          style={{ background: 'var(--violet-500)', animation: 'pulse 1.8s ease-in-out infinite' }}
        />
        {primaryLine}
      </div>
      <div className="mt-0.5 text-[10.5px] text-fg-dim">{t('workOrders.dispatches.liveSelfReported')}</div>
    </div>
  );
}

// Per-state footer, mirroring the drawer: every card gets one action row.
function CardFooter({
  d,
  readOnly,
  onEdit,
  onAdvance,
  advancing,
  onViewInvoice,
}: {
  d: DispatchBoardRow;
  readOnly: boolean;
  onEdit: (d: Dispatch) => void;
  onAdvance: (d: Dispatch, status: DispatchStatus) => void;
  advancing: boolean;
  onViewInvoice?: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  if (d.status === 'COMPLETED') {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-[11.5px]">
        <span className="text-fg-muted">
          {d.departedAt
            ? t('workOrders.dispatches.completedAt', { time: ETA_DATE.format(new Date(d.departedAt)) })
            : t('workOrders.dispatches.status.COMPLETED')}
        </span>
        <span className="flex-1" />
        {onViewInvoice && (
          <button
            type="button"
            onClick={onViewInvoice}
            className="whitespace-nowrap text-fg-accent hover:underline"
            style={{ fontSize: '12px', fontWeight: 600 }}
          >
            {t('workOrders.dispatches.viewInvoice')} →
          </button>
        )}
      </div>
    );
  }

  if (readOnly) return null;

  // Scheduled / en route / on site — single Edit + the one next-step transition.
  const primary =
    d.status === 'EN_ROUTE'
      ? { label: t('workOrders.dispatches.drawer.markOnSite'), next: 'IN_PROGRESS' as DispatchStatus }
      : d.status === 'IN_PROGRESS'
        ? {
            label: t('workOrders.dispatches.drawer.completeVisit', { entity: getName('dispatch') }),
            next: 'COMPLETED' as DispatchStatus,
          }
        : { label: t('workOrders.dispatches.drawer.markEnRoute'), next: 'EN_ROUTE' as DispatchStatus };

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <Button outline onClick={() => onEdit(d)}>
        {`${t('common.edit')} ${getName('dispatch').toLowerCase()}`}
      </Button>
      <span className="flex-1" />
      <Button color="accent" disabled={advancing} onClick={() => onAdvance(d, primary.next)}>
        {primary.label}
      </Button>
    </div>
  );
}

function DispatchCard({
  d,
  seq,
  media,
  workItemById,
  readOnly,
  onEdit,
  onSelect,
  onAdvance,
  advancing,
  onViewInvoice,
}: {
  d: DispatchBoardRow;
  seq: number;
  media: WorkOrderFile[];
  workItemById: Map<string, WorkItemResponse>;
  readOnly: boolean;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
  onAdvance: (dispatch: Dispatch, status: DispatchStatus) => void;
  advancing: boolean;
  onViewInvoice?: () => void;
}) {
  const { t } = useTranslation();
  const live = isLive(d.status);
  const photos = media.filter((m) => m.kind === 'PHOTO').length;
  const videos = media.filter((m) => m.kind === 'VIDEO').length;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Parts-blocked flag — any addressed work item stalled awaiting parts.
  const blocked = (d.addressedWorkItemIds ?? []).some((id) => workItemById.get(id)?.statusCategory === 'BLOCKED');

  // Visit note — the content of the visit. Same source as the drawer (the notes
  // log); the most recent pinned-or-latest entry, falling back to the dispatch's
  // free-text note. Cached under the drawer's key, so opening the drawer reuses it.
  const { data: notesData } = useQuery({
    queryKey: ['dispatch-notes', d.id],
    queryFn: () => dispatchNotesApi.list(d.id),
  });
  const latestNote = useMemo(() => {
    const list = Array.isArray(notesData) ? notesData : [];
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted.find((n) => n.pinned) ?? sorted[0];
  }, [notesData]);
  const noteText = latestNote?.body ?? d.notes ?? null;

  return (
    <div
      className="overflow-hidden rounded-lg border bg-bg-elev"
      style={
        live
          ? {
              // Live visits carry a solid violet accent rail + tinted border so
              // the moving dispatch reads distinctly from the calm cards.
              borderColor: 'color-mix(in oklch, var(--violet-500) 45%, var(--border))',
              borderLeft: '3px solid var(--violet-500)',
            }
          : { borderColor: 'var(--border)' }
      }
    >
      <TripHead d={d} seq={seq} workItemById={workItemById} onSelect={onSelect} />
      <div className="border-t border-border-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          {d.assignedUserName && <Avatar name={d.assignedUserName} size="sm" />}
          <span className="font-semibold text-fg-strong">{d.assignedUserName ?? '—'}</span>
          {photos > 0 && <span className="text-fg-muted">· {t('workOrders.dispatches.photoCount', { count: photos })}</span>}
          {videos > 0 && <span className="text-fg-muted">· {t('workOrders.dispatches.videoCount', { count: videos })}</span>}
          {blocked && (
            <span className="font-semibold" style={{ color: 'var(--warning-fg)' }}>
              · {t('workOrders.dispatches.partsBlocked')}
            </span>
          )}
        </div>

        {live && <LiveStatusStrip d={d} />}

        {noteText && <div className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-fg">{noteText}</div>}

        <MediaThumbs media={media} onOpen={(i) => setLightboxIndex(i)} />

        <CardFooter
          d={d}
          readOnly={readOnly}
          onEdit={onEdit}
          onAdvance={onAdvance}
          advancing={advancing}
          onViewInvoice={onViewInvoice}
        />
      </div>

      {/* Fullscreen viewer for the visit's captured media (view-only here). */}
      <FileLightbox
        media={media}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        readOnly
        onRequestDelete={() => undefined}
      />
    </div>
  );
}
