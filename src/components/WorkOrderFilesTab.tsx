/* eslint-disable i18next/no-literal-string -- dense files aggregator tab on the WO detail page; entity names go through getName(), inline glyphs/separators and short operational labels stay literal (same convention as LocationFilesTab). */
// ─────────────────────────────────────────────────────────────────────────
// Work Order Files tab — the media aggregator for one job.
//
// Single source: GET /work-orders/{id}/files (work-order-service). Photos +
// videos lead as grids; documents as a list. The redesign's "media graph"
// grouping is DERIVED, not stored: visual files group by their capture visit
// (`dispatchId`) matched against the WO's dispatches → "Trip N"; equipment-
// anchored captures with no visit → "Equipment"; the rest → "Other". Trip
// photo/video counts therefore derive from the graph (no stored count).
//
// Deferred (backend): receipt grouping (needs PO/poId — procurement phase).
// ─────────────────────────────────────────────────────────────────────────
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Headless from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon,
  VideoCameraIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import {
  workOrderFilesApi,
  type Dispatch,
  type FileKind,
  type PagedFiles,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatTimestamp } from '../lib/formatTimestamp';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { Card } from './catalyst/card';
import { Button } from './catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Pill } from './ui/Pill';
import { LoadingState } from './ui/LoadingState';
import { ErrorState } from './ui/ErrorState';
import IconButton from './IconButton';
import ConfirmDialog from './ConfirmDialog';
import WorkOrderFileUploadDialog from './WorkOrderFileUploadDialog';

const PAGE_LIMIT = 100;

type TypeFilter = 'all' | FileKind;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function formatVideoDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function nextPageParam<T>(last: PagedFiles<T>): number | undefined {
  return last.last === false ? last.number + 2 : undefined;
}

// Short date for a trip-group sub-label.
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Resolve dispatches → a stable trip ordinal (earliest arrival = Trip 1, the
// same chronological basis the schedule reads). Cancelled dispatches keep their
// ordinal so a file tagged to one still groups sensibly.
function buildTripIndex(dispatches: Dispatch[]): Map<string, { seq: number; date: string }> {
  const ordered = [...dispatches].sort(
    (a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime(),
  );
  const map = new Map<string, { seq: number; date: string }>();
  ordered.forEach((d, i) => map.set(d.id, { seq: i + 1, date: shortDate(d.arrivalWindowStart) }));
  return map;
}

interface FileGroup {
  key: string;
  label: string;
  sub?: string;
  files: WorkOrderFile[];
}

export default function WorkOrderFilesTab({
  workOrderId,
  dispatches,
  readOnly = false,
}: {
  workOrderId: string;
  dispatches: Dispatch[];
  readOnly?: boolean;
}) {
  const { getName } = useGlossary();
  const [type, setType] = useState<TypeFilter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  // Flat index into the combined visual set (photos + videos, newest-first) so
  // the lightbox can page across every image/clip regardless of its group.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingFile, setDeletingFile] = useState<WorkOrderFile | null>(null);

  const kindParam = type === 'all' ? undefined : type;
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['work-order-files', workOrderId, kindParam ?? 'all'] as const,
    queryFn: ({ pageParam }) =>
      workOrderFilesApi.list(workOrderId, { kind: kindParam, page: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    // Videos confirm as PROCESSING then transcode to READY — poll while any tile
    // is still processing, stop once none remain (no push channel).
    refetchInterval: (q) =>
      (q.state.data?.pages ?? []).some((p) => p.content.some((f) => f.status === 'PROCESSING'))
        ? 4000
        : false,
  });

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const counts = pages[0]?.counts;
  const all = useMemo(
    () =>
      pages
        .flatMap((p) => p.content)
        .filter((f) => f.status !== 'FAILED')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [pages],
  );

  const visuals = useMemo(() => all.filter((f) => f.kind === 'PHOTO' || f.kind === 'VIDEO'), [all]);
  const docs = useMemo(() => all.filter((f) => f.kind === 'DOCUMENT'), [all]);
  const indexInVisuals = useMemo(() => {
    const m = new Map<string, number>();
    visuals.forEach((f, i) => m.set(f.id, i));
    return m;
  }, [visuals]);

  const tripIndex = useMemo(() => buildTripIndex(dispatches), [dispatches]);

  // Visual files → derived groups: Trip N (by capture visit) → Equipment → Other.
  const visualGroups = useMemo<FileGroup[]>(() => {
    const trips = new Map<string, FileGroup>();
    const equipment: WorkOrderFile[] = [];
    const other: WorkOrderFile[] = [];
    for (const f of visuals) {
      const trip = f.dispatchId ? tripIndex.get(f.dispatchId) : undefined;
      if (trip) {
        const key = `trip-${f.dispatchId}`;
        const g =
          trips.get(key) ??
          { key, label: `${getName('dispatch')} ${trip.seq}`, sub: trip.date, files: [] };
        g.files.push(f);
        trips.set(key, g);
      } else if (f.equipmentId) {
        equipment.push(f);
      } else {
        other.push(f);
      }
    }
    const tripGroups = [...trips.values()].sort((a, b) => {
      const sa = tripIndex.get(a.key.replace('trip-', ''))?.seq ?? 0;
      const sb = tripIndex.get(b.key.replace('trip-', ''))?.seq ?? 0;
      return sa - sb;
    });
    const out: FileGroup[] = [...tripGroups];
    if (equipment.length) out.push({ key: 'equipment', label: getName('equipment'), files: equipment });
    if (other.length) out.push({ key: 'other', label: 'Other', files: other });
    return out;
  }, [visuals, tripIndex, getName]);

  const deleteMutation = useMutation({
    mutationFn: (file: WorkOrderFile) => workOrderFilesApi.delete(workOrderId, file.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-order-files', workOrderId] });
      setDeletingFile(null);
      setLightboxIndex(null);
      showSuccess('File deleted');
    },
    onError: (err) => showError("Couldn't delete file", extractApiError(err) ?? undefined),
  });

  const isLoading = query.isLoading;
  const hasMore = query.hasNextPage;
  const loadedTotal = pages.reduce((n, p) => n + p.content.length, 0);
  const serverTotal = pages[0]?.totalElements ?? 0;

  const typeChips: { id: TypeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts?.all ?? 0 },
    { id: 'PHOTO', label: 'Photos', count: counts?.photos ?? 0 },
    { id: 'VIDEO', label: 'Videos', count: counts?.videos ?? 0 },
    { id: 'DOCUMENT', label: 'Documents', count: counts?.documents ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — type segmented control · Upload */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="File type">
          {typeChips.map((c) => {
            const active = type === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setType(c.id)}
                aria-pressed={active}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium ${
                  active
                    ? 'border-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))] bg-[color-mix(in_oklch,var(--accent-500)_9%,var(--bg-elev))] text-fg-accent'
                    : 'border-border bg-bg-elev text-fg'
                }`}
              >
                {c.label}
                <span
                  className={`rounded px-1.5 font-mono text-[10.5px] font-semibold tabular-nums ${active ? 'bg-[color-mix(in_oklch,var(--accent-500)_18%,var(--bg-elev))] text-fg-accent' : 'bg-bg-active text-fg-dim'}`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        <span className="grow" />
        {!readOnly && (
          <Button color="accent" size="xs" onClick={() => setUploadOpen(true)}>
            <PlusIcon className="size-4" />
            Upload
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card padding="none">
          <LoadingState label="Loading files…" />
        </Card>
      ) : query.isError ? (
        <Card padding="none">
          <ErrorState
            title="Couldn't load files"
            description={extractApiError(query.error) ?? (query.error as Error).message}
            action={
              <Button outline onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : all.length === 0 ? (
        <Card padding="none">
          <div className="px-5 py-11 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {type === 'all' ? 'No files yet' : 'No files match'}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              Photos, videos, and documents captured on this {getName('work_order').toLowerCase()} land
              here — or upload one directly.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Visual groups — Trip N → Equipment → Other, each a grid */}
          {visualGroups.map((g) => (
            <Card
              key={g.key}
              title={
                <span className="flex items-center gap-1.5">
                  {g.key.startsWith('trip-') ? (
                    <TruckIcon className="size-3.5 text-fg-muted" />
                  ) : (
                    <PhotoIcon className="size-3.5 text-fg-muted" />
                  )}
                  {g.label}
                  {g.sub && <span className="text-[11px] font-normal text-fg-dim">· {g.sub}</span>}
                </span>
              }
              action={<span className="font-mono text-[11px] tabular-nums text-fg-muted">{g.files.length}</span>}
              padding="none"
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5 p-3">
                {g.files.map((f) =>
                  f.kind === 'VIDEO' ? (
                    <VideoTile key={f.id} f={f} onOpen={() => setLightboxIndex(indexInVisuals.get(f.id) ?? null)} />
                  ) : (
                    <PhotoTile key={f.id} f={f} onOpen={() => setLightboxIndex(indexInVisuals.get(f.id) ?? null)} />
                  ),
                )}
              </div>
            </Card>
          ))}

          {/* Documents — list */}
          {docs.length > 0 && (
            <Card
              title={
                <span className="flex items-center gap-1.5">
                  <DocumentTextIcon className="size-3.5 text-fg-muted" />
                  Documents
                </span>
              }
              action={<span className="font-mono text-[11px] tabular-nums text-fg-muted">{docs.length}</span>}
              padding="none"
            >
              {docs.map((f, i) => (
                <DocRow
                  key={f.id}
                  f={f}
                  last={i === docs.length - 1}
                  readOnly={readOnly}
                  onRequestDelete={() => setDeletingFile(f)}
                />
              ))}
            </Card>
          )}

          {hasMore && (
            <div className="flex items-center justify-center gap-2.5 py-1 text-[11.5px] text-fg-muted">
              <span>
                Showing the newest <strong className="text-fg-strong">{loadedTotal}</strong> of {serverTotal} files
              </span>
              <Button outline size="xxs" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <WorkOrderFileUploadDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        workOrderId={workOrderId}
        dispatches={dispatches}
      />

      <FileLightbox
        media={visuals}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        readOnly={readOnly}
        onRequestDelete={(f) => setDeletingFile(f)}
      />

      <ConfirmDialog
        isOpen={deletingFile !== null}
        onClose={() => setDeletingFile(null)}
        onConfirm={() => deletingFile && deleteMutation.mutate(deletingFile)}
        title={deletingFile ? `Delete ${deletingFile.fileName}?` : 'Delete file?'}
        message="This permanently removes the file from this job."
        confirmLabel="Delete"
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// Subject backlink chips — the work item / equipment a file documents.
function SubjectChips({ f }: { f: WorkOrderFile }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (!f.equipmentId || !f.equipmentName) return null;
  return (
    <Link to={`/equipment/${f.equipmentId}`} onClick={stop} title="View equipment">
      <Pill tone="violet">{f.equipmentName}</Pill>
    </Link>
  );
}

function TileMeta({ f }: { f: WorkOrderFile }) {
  return (
    <div className="mt-1.5 min-w-0">
      <div className="truncate text-[11.5px] font-medium text-fg-strong" title={f.fileName}>
        {f.caption || f.fileName}
      </div>
      {f.equipmentId && f.equipmentName && (
        <div className="mt-1">
          <SubjectChips f={f} />
        </div>
      )}
      <div className="mt-1 text-[10.5px] text-fg-dim">
        {formatTimestamp(f.createdAt)}
        {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
      </div>
    </div>
  );
}

// Before/After label overlaid on captured visit media (set by the tech app or
// the office upload dialog). Absolute — the tile's thumbnail wrapper is relative.
function CaptureTagBadge({ f }: { f: WorkOrderFile }) {
  if (f.captureTag == null) return null;
  return (
    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white">
      {f.captureTag === 'BEFORE' ? 'Before' : 'After'}
    </span>
  );
}

function PhotoTile({ f, onOpen }: { f: WorkOrderFile; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-border-soft bg-bg-active">
        <img
          src={f.thumbnailUrl ?? f.url}
          alt={f.caption ?? f.fileName}
          loading="lazy"
          className="size-full object-cover transition-opacity group-hover:opacity-85"
        />
        <CaptureTagBadge f={f} />
      </div>
      <TileMeta f={f} />
    </button>
  );
}

function VideoTile({ f, onOpen }: { f: WorkOrderFile; onOpen: () => void }) {
  const processing = f.status === 'PROCESSING';
  return (
    <button
      type="button"
      onClick={processing ? undefined : onOpen}
      disabled={processing}
      aria-label={processing ? `${f.fileName} (processing)` : f.fileName}
      className="group min-w-0 text-left disabled:cursor-default"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-border-soft bg-bg-active">
        {processing ? (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-fg-muted">
            <ArrowPathIcon className="size-5 animate-spin" />
            <span className="text-[10.5px]">Processing…</span>
          </div>
        ) : f.thumbnailUrl ? (
          <img
            src={f.thumbnailUrl}
            alt={f.caption ?? f.fileName}
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-85"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <VideoCameraIcon className="size-7 text-fg-dim" />
          </div>
        )}

        {!processing && (
          <>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-inset ring-white/25 backdrop-blur-[1px] transition group-hover:bg-black/70">
                <PlayIcon className="size-4 translate-x-px text-white" />
              </span>
            </span>
            {f.durationSeconds != null && (
              <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-white">
                {formatVideoDuration(f.durationSeconds)}
              </span>
            )}
          </>
        )}
        <CaptureTagBadge f={f} />
      </div>
      <TileMeta f={f} />
    </button>
  );
}

function DocRow({
  f,
  last,
  readOnly,
  onRequestDelete,
}: {
  f: WorkOrderFile;
  last: boolean;
  readOnly: boolean;
  onRequestDelete: () => void;
}) {
  const open = () => window.open(f.url, '_blank', 'noopener');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      className={`grid cursor-pointer grid-cols-[20px_minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2 hover:bg-bg-hover ${last ? '' : 'border-b border-border-soft'}`}
    >
      <DocumentTextIcon className="size-4 text-fg-dim" />
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-fg-strong" title={f.fileName}>
          {f.caption || f.fileName}
        </div>
        <div className="text-[11px] text-fg-muted">
          {formatTimestamp(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''} · {formatBytes(f.sizeBytes)}
        </div>
      </div>
      <div className="min-w-0">
        <SubjectChips f={f} />
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown>
          <DropdownButton as={IconButton} aria-label="File actions">
            <EllipsisVerticalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={open}>
              <ArrowDownTrayIcon />
              <DropdownLabel>Open</DropdownLabel>
            </DropdownItem>
            {!readOnly && (
              <DropdownItem onClick={onRequestDelete}>
                <TrashIcon />
                <DropdownLabel>Delete</DropdownLabel>
              </DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Lightbox — view-first over the filtered photo/video set; videos play inline.
// Delete (when not read-only) routes back to the tab's ConfirmDialog. Built on
// Headless Dialog directly, same dark edge-to-edge panel as the location one.
// ─────────────────────────────────────────────────────────────────────────
export function FileLightbox({
  media,
  startIndex,
  onClose,
  readOnly,
  onRequestDelete,
}: {
  media: WorkOrderFile[];
  startIndex: number | null;
  onClose: () => void;
  readOnly: boolean;
  onRequestDelete: (f: WorkOrderFile) => void;
}) {
  if (startIndex === null || media.length === 0) return null;
  return (
    <LightboxInner
      media={media}
      startIndex={startIndex}
      onClose={onClose}
      readOnly={readOnly}
      onRequestDelete={onRequestDelete}
    />
  );
}

function LightboxInner({
  media,
  startIndex,
  onClose,
  readOnly,
  onRequestDelete,
}: {
  media: WorkOrderFile[];
  startIndex: number;
  onClose: () => void;
  readOnly: boolean;
  onRequestDelete: (f: WorkOrderFile) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const total = media.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = media[safeIndex];

  // Arrow-key navigation. Headless's Dialog handles ESC + click-outside.
  useEffect(() => {
    if (total <= 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIndex((i) => Math.min(total - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [total]);

  return (
    <Headless.Dialog open onClose={onClose} className="relative z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-black/85 transition duration-150 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center">
        <Headless.DialogPanel
          transition
          className="relative flex h-full w-full flex-col items-center justify-center px-4 py-12 transition duration-150 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRequestDelete(current)}
                aria-label="Delete"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <TrashIcon className="size-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <XMarkIcon className="size-6" />
            </button>
          </div>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex <= 0}
                aria-label="Previous"
                className="absolute left-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronLeftIcon className="size-7" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                disabled={safeIndex >= total - 1}
                aria-label="Next"
                className="absolute right-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronRightIcon className="size-7" />
              </button>
            </>
          )}

          {current.kind === 'VIDEO' ? (
            <VideoPlayer key={current.id} file={current} />
          ) : (
            <img
              src={current.url}
              alt={current.caption ?? current.fileName}
              className="max-h-full max-w-full select-none object-contain"
            />
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-white">
            <div className="text-sm [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.caption || current.fileName}
            </div>
            <div className="flex items-center gap-2 text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.equipmentName && <span>{current.equipmentName}</span>}
              {current.uploadedByName && <span>· {current.uploadedByName}</span>}
              <span>· {formatTimestamp(current.createdAt)}</span>
              {total > 1 && (
                <span className="font-mono tabular-nums">
                  · {safeIndex + 1} / {total}
                </span>
              )}
            </div>
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  );
}

function VideoPlayer({ file }: { file: WorkOrderFile }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 text-center text-white">
        <ExclamationTriangleIcon className="size-9 text-white/70" />
        <div className="text-sm [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">This video couldn’t be loaded.</div>
        <a
          href={file.url}
          download={file.fileName}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowDownTrayIcon className="size-4" />
          Download
        </a>
      </div>
    );
  }
  return (
    <video
      src={file.url}
      poster={file.thumbnailUrl ?? undefined}
      controls
      playsInline
      onError={() => setErrored(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}
