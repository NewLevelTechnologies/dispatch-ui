/* eslint-disable i18next/no-literal-string -- dense aggregator tab on the location detail page; entity names go through getName()/t(), inline glyphs, separators, and short operational labels stay literal (same convention as ServiceLocationDetailPage). */
// ─────────────────────────────────────────────────────────────────────────
// Location Files tab — an AGGREGATOR, not an upload bucket.
//
// Most files are born attached to something else (a work order, an equipment
// record); a few are direct site uploads. This tab is the one place to see
// every file tied to the location, merged from two backends:
//
//  · work-order-service  GET /files?serviceLocationId= — every job-born /
//    equipment-anchored file at the site (chips carry the backlinks)
//  · customer-service    GET /service-locations/{id}/files — direct site
//    uploads (COI, floor plan, access docs…); the Upload button posts here
//
// Provenance is the organizing principle, not folders: type segmented control
// (All/Photos/Documents, counts summed from both endpoints), source filter,
// photos as a grid (volume driver), documents as a list. No folder tree, no
// versioning, no rename ceremony — see claude_designs/location-files-tab.md.
// ─────────────────────────────────────────────────────────────────────────
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Headless from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  PhotoIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import {
  filesApi,
  locationFilesApi,
  LOCATION_FILE_CATEGORY_LABELS,
  type FileKind,
  type LocationFile,
  type LocationFileCategory,
  type PagedFiles,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatTimestamp } from '../lib/formatTimestamp';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { Card } from './catalyst/card';
import { Button } from './catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { FilterChipListbox, ChipListboxOption } from './ui/FilterChipListbox';
import { Pill } from './ui/Pill';
import { Callout } from './ui/Callout';
import IconButton from './IconButton';
import LocationFileUploadDialog from './LocationFileUploadDialog';

const PAGE_LIMIT = 100;

type TypeFilter = 'all' | FileKind;
type SourceFilter = 'all' | 'wo' | 'equip' | 'upload';

// One normalized shape over both wire DTOs. `origin` discriminates the anchor
// service (job/equipment files are read-only here; site files are managed here).
export interface SiteFile {
  key: string;
  origin: 'job' | 'site';
  id: string;
  kind: FileKind;
  fileName: string;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  caption: string | null;
  uploadedByName: string | null;
  createdAt: string;
  isProfile: boolean;
  // Job-origin backlinks (either or both present on origin === 'job').
  workOrderId: string | null;
  workOrderNumber: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  // Site-origin category (origin === 'site' only).
  category: LocationFileCategory | null;
}

function fromWorkOrderFile(f: WorkOrderFile): SiteFile {
  return {
    key: `job-${f.id}`,
    origin: 'job',
    id: f.id,
    kind: f.kind,
    fileName: f.fileName,
    url: f.url,
    thumbnailUrl: f.thumbnailUrl,
    sizeBytes: f.sizeBytes,
    caption: f.caption,
    uploadedByName: f.uploadedByName,
    createdAt: f.createdAt,
    isProfile: false,
    workOrderId: f.workOrderId,
    workOrderNumber: f.workOrderNumber,
    equipmentId: f.equipmentId,
    equipmentName: f.equipmentName,
    category: null,
  };
}

function fromLocationFile(f: LocationFile): SiteFile {
  return {
    key: `site-${f.id}`,
    origin: 'site',
    id: f.id,
    kind: f.kind,
    fileName: f.fileName,
    url: f.url,
    thumbnailUrl: f.thumbnailUrl,
    sizeBytes: f.sizeBytes,
    caption: f.caption,
    uploadedByName: f.uploadedByName,
    createdAt: f.createdAt,
    isProfile: f.isProfile,
    workOrderId: null,
    workOrderNumber: null,
    equipmentId: null,
    equipmentName: null,
    category: f.category,
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Shared infinite-page helpers — the two sources page independently (1-indexed
// `page` param; Spring's envelope rides back with 0-based `number` + `last`).
function nextPageParam<T>(last: PagedFiles<T>): number | undefined {
  return last.last === false ? last.number + 2 : undefined;
}

export default function LocationFilesTab({
  locationId,
  canEdit,
}: {
  locationId: string;
  canEdit: boolean;
}) {
  const { getName } = useGlossary();
  const [type, setType] = useState<TypeFilter>('all');
  const [src, setSrc] = useState<SourceFilter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  // Index into the *filtered photos* array; null = closed.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const kindParam = type === 'all' ? undefined : type;

  // Job/equipment aggregate (work-order-service). Can lag infra (the /files
  // ALB rule) — degrade to direct uploads with a callout instead of failing
  // the whole tab.
  const aggQuery = useInfiniteQuery({
    queryKey: ['location-files', locationId, 'agg', kindParam ?? 'all'] as const,
    queryFn: ({ pageParam }) =>
      filesApi.listForServiceLocation(locationId, { kind: kindParam, page: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    retry: 1,
  });

  // Direct site uploads (customer-service).
  const directQuery = useInfiniteQuery({
    queryKey: ['location-files', locationId, 'direct', kindParam ?? 'all'] as const,
    queryFn: ({ pageParam }) =>
      locationFilesApi.list(locationId, { kind: kindParam, page: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });

  const aggPages = useMemo(() => aggQuery.data?.pages ?? [], [aggQuery.data]);
  const directPages = useMemo(() => directQuery.data?.pages ?? [], [directQuery.data]);

  // Segmented-control counts: anchor-wide totals summed across both sources
  // (independent of the kind/source filters, per the wire contract).
  const aggCounts = aggPages[0]?.counts;
  const directCounts = directPages[0]?.counts;
  const counts = {
    all: (aggCounts?.all ?? 0) + (directCounts?.all ?? 0),
    photos: (aggCounts?.photos ?? 0) + (directCounts?.photos ?? 0),
    documents: (aggCounts?.documents ?? 0) + (directCounts?.documents ?? 0),
  };

  // Merge → source-filter → newest-first. Type is already server-filtered.
  const merged = useMemo(() => {
    const items = [
      ...aggPages.flatMap((p) => p.content.map(fromWorkOrderFile)),
      ...directPages.flatMap((p) => p.content.map(fromLocationFile)),
    ];
    const filtered =
      src === 'all'
        ? items
        : items.filter((f) =>
            src === 'upload'
              ? f.origin === 'site'
              : src === 'wo'
                ? f.workOrderId !== null
                : f.equipmentId !== null
          );
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [aggPages, directPages, src]);

  const photos = useMemo(() => merged.filter((f) => f.kind === 'PHOTO'), [merged]);
  const docs = useMemo(() => merged.filter((f) => f.kind === 'DOCUMENT'), [merged]);

  const isLoading = aggQuery.isLoading || directQuery.isLoading;
  const filtersActive = type !== 'all' || src !== 'all';

  // Truncation honesty: both lists page at 100 — when either has more, say so
  // and offer to pull the next slice from each source that has one.
  const hasMore = aggQuery.hasNextPage || directQuery.hasNextPage;
  const loadingMore = aggQuery.isFetchingNextPage || directQuery.isFetchingNextPage;
  const loadedTotal =
    aggPages.reduce((n, p) => n + p.content.length, 0) +
    directPages.reduce((n, p) => n + p.content.length, 0);
  const serverTotal = (aggPages[0]?.totalElements ?? 0) + (directPages[0]?.totalElements ?? 0);
  const loadMore = () => {
    if (aggQuery.hasNextPage) void aggQuery.fetchNextPage();
    if (directQuery.hasNextPage) void directQuery.fetchNextPage();
  };

  const typeChips: { id: TypeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'PHOTO', label: 'Photos', count: counts.photos },
    { id: 'DOCUMENT', label: 'Documents', count: counts.documents },
  ];
  const srcLabels: Record<SourceFilter, string> = {
    all: 'All sources',
    wo: `From ${getName('work_order', true).toLowerCase()}`,
    equip: `From ${getName('equipment', true).toLowerCase()}`,
    upload: 'Uploaded',
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — type segmented control (primary cut) · source filter · Upload */}
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

        <FilterChipListbox
          label="Source"
          ariaLabel="Source"
          value={src}
          displayValue={src === 'all' ? 'All' : srcLabels[src]}
          onChange={(id) => setSrc(id as SourceFilter)}
        >
          {(Object.keys(srcLabels) as SourceFilter[]).map((id) => (
            <ChipListboxOption key={id} value={id}>
              {srcLabels[id]}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        {filtersActive && (
          <Button
            plain
            size="xs"
            onClick={() => {
              setType('all');
              setSrc('all');
            }}
          >
            Clear
          </Button>
        )}

        <span className="grow" />
        {canEdit && (
          <Button color="accent" size="xs" onClick={() => setUploadOpen(true)}>
            <PlusIcon className="size-4" />
            Upload
          </Button>
        )}
      </div>

      {/* The aggregate read can be down independently of direct uploads —
          show what we have rather than blanking the tab. */}
      {aggQuery.isError && (
        <Callout kind="warning">
          {getName('work_order')} and {getName('equipment').toLowerCase()} files couldn’t load — showing
          direct site uploads only.
        </Callout>
      )}

      {isLoading ? (
        <Card padding="none">
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">Loading files…</div>
        </Card>
      ) : merged.length === 0 ? (
        <Card padding="none">
          <div className="px-5 py-11 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive ? 'No files match' : 'No files yet'}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust the filters, or upload a site document.'
                : `Photos and documents from ${getName('work_order', true).toLowerCase()} land here automatically — or upload a site document directly.`}
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Photos — grid (the volume driver leads) */}
          {photos.length > 0 && (
            <Card
              title={
                <span className="flex items-center gap-1.5">
                  <PhotoIcon className="size-3.5 text-fg-muted" />
                  Photos
                </span>
              }
              action={<span className="font-mono text-[11px] tabular-nums text-fg-muted">{photos.length}</span>}
              padding="none"
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5 p-3">
                {photos.map((f, i) => (
                  <PhotoTile key={f.key} f={f} onOpen={() => setLightboxIndex(i)} />
                ))}
              </div>
            </Card>
          )}

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
                  key={f.key}
                  f={f}
                  last={i === docs.length - 1}
                  locationId={locationId}
                  canEdit={canEdit}
                />
              ))}
            </Card>
          )}

          {hasMore && (
            <div className="flex items-center justify-center gap-2.5 py-1 text-[11.5px] text-fg-muted">
              <span>
                Showing the newest <strong className="text-fg-strong">{loadedTotal}</strong> of {serverTotal} files
              </span>
              <Button outline size="xxs" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <LocationFileUploadDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        locationId={locationId}
      />

      <FileLightbox
        photos={photos}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        locationId={locationId}
        canEdit={canEdit}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Provenance chips — on every file, tone by source. WO numbers read as
// characters → mono; equipment names and category labels are words →
// proportional. Backlinks navigate to the origin record.
// ─────────────────────────────────────────────────────────────────────────
// Label for a direct upload's chip — the canonical site photo announces
// itself (the isProfile flag is the source of truth, not a wire category);
// everything else shows its category, falling back to "Site document".
function siteFileChipLabel(f: SiteFile): string {
  if (f.isProfile) return 'Site photo';
  return f.category ? LOCATION_FILE_CATEGORY_LABELS[f.category] : 'Site document';
}

function SourceChips({ f }: { f: SiteFile }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (f.origin === 'site') {
    return <Pill tone="neutral">{siteFileChipLabel(f)}</Pill>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {f.workOrderId && f.workOrderNumber && (
        <Link to={`/work-orders/${f.workOrderId}`} onClick={stop} title="View work order">
          <Pill tone="info" className="font-mono">{f.workOrderNumber}</Pill>
        </Link>
      )}
      {f.equipmentId && f.equipmentName && (
        <Link to={`/equipment/${f.equipmentId}`} onClick={stop} title="View equipment">
          <Pill tone="violet">{f.equipmentName}</Pill>
        </Link>
      )}
    </span>
  );
}

function PhotoTile({ f, onOpen }: { f: SiteFile; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left">
      <div className="aspect-[4/3] overflow-hidden rounded-md border border-border-soft bg-bg-active">
        <img
          src={f.thumbnailUrl ?? f.url}
          alt={f.caption ?? f.fileName}
          loading="lazy"
          className="size-full object-cover transition-opacity group-hover:opacity-85"
        />
      </div>
      <div className="mt-1.5 min-w-0">
        <div className="truncate text-[11.5px] font-medium text-fg-strong" title={f.fileName}>
          {f.fileName}
        </div>
        <div className="mt-1"><SourceChips f={f} /></div>
        <div className="mt-1 text-[10.5px] text-fg-dim">
          {formatTimestamp(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
        </div>
      </div>
    </button>
  );
}

function DocRow({
  f,
  last,
  locationId,
  canEdit,
}: {
  f: SiteFile;
  last: boolean;
  locationId: string;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => locationFilesApi.delete(locationId, f.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-files', locationId] });
      showSuccess('File deleted');
    },
    onError: (err) => showError('Couldn’t delete file', extractApiError(err) ?? undefined),
  });

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
          {f.fileName}
        </div>
        <div className="text-[11px] text-fg-muted">
          {formatTimestamp(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''} · {formatBytes(f.sizeBytes)}
        </div>
      </div>
      <div className="min-w-0"><SourceChips f={f} /></div>
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
            {f.workOrderId && (
              <DropdownItem onClick={() => navigate(`/work-orders/${f.workOrderId}`)}>
                <DropdownLabel>View work order</DropdownLabel>
              </DropdownItem>
            )}
            {f.origin === 'site' && canEdit && (
              <DropdownItem
                onClick={() => {
                  if (window.confirm(`Delete ${f.fileName}?`)) deleteMutation.mutate();
                }}
              >
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
// Lightbox — read-first viewer over the filtered photo set. Site-uploaded
// photos additionally get manage actions (set as site photo, delete); job /
// equipment photos are managed on their own records, so the toolbar stays
// view-only for them (the caption strip carries the provenance instead).
// Built on Headless Dialog directly (dark edge-to-edge panel), same as
// EquipmentPhotoLightbox.
// ─────────────────────────────────────────────────────────────────────────
function FileLightbox({
  photos,
  startIndex,
  onClose,
  locationId,
  canEdit,
}: {
  photos: SiteFile[];
  startIndex: number | null;
  onClose: () => void;
  locationId: string;
  canEdit: boolean;
}) {
  if (startIndex === null || photos.length === 0) return null;
  return (
    <LightboxInner
      photos={photos}
      startIndex={startIndex}
      onClose={onClose}
      locationId={locationId}
      canEdit={canEdit}
    />
  );
}

function LightboxInner({
  photos,
  startIndex,
  onClose,
  locationId,
  canEdit,
}: {
  photos: SiteFile[];
  startIndex: number;
  onClose: () => void;
  locationId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(startIndex);

  const total = photos.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = photos[safeIndex];
  const manageable = current.origin === 'site' && canEdit;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['location-files', locationId] });
    // Profile changes surface on the detail header + locations list rows.
    queryClient.invalidateQueries({ queryKey: ['service-location', locationId] });
    queryClient.invalidateQueries({ queryKey: ['service-locations'] });
  };

  // Toggle — true promotes (backend demotes any previous site photo), false
  // clears it (no photo set → the header falls back to the premise glyph).
  const profileMutation = useMutation({
    mutationFn: (isProfile: boolean) =>
      locationFilesApi.patch(locationId, current.id, { isProfile }),
    onSuccess: (_data, isProfile) => {
      invalidate();
      showSuccess(isProfile ? 'Site photo set' : 'Site photo removed');
    },
    onError: (err) => showError('Couldn’t update site photo', extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: () => locationFilesApi.delete(locationId, current.id),
    onSuccess: () => {
      const wasLast = total === 1;
      invalidate();
      showSuccess('Photo deleted');
      if (wasLast) onClose();
      else setIndex((i) => Math.max(0, Math.min(i, total - 2)));
    },
    onError: (err) => showError('Couldn’t delete photo', extractApiError(err) ?? undefined),
  });

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
            {manageable && (
              <>
                {current.isProfile ? (
                  <button
                    type="button"
                    onClick={() => profileMutation.mutate(false)}
                    disabled={profileMutation.isPending}
                    title="Remove site photo"
                    className="group inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 ring-1 ring-inset ring-amber-400/30 hover:bg-amber-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <StarIconSolid className="size-4" />
                    Site photo
                    <XMarkIcon className="size-3.5 opacity-60 group-hover:opacity-100" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => profileMutation.mutate(true)}
                    disabled={profileMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <StarIcon className="size-4" />
                    Set as site photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete ${current.fileName}?`)) deleteMutation.mutate();
                  }}
                  disabled={deleteMutation.isPending}
                  aria-label="Delete"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon className="size-4" />
                  Delete
                </button>
              </>
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

          <img
            src={current.url}
            alt={current.caption ?? current.fileName}
            className="max-h-full max-w-full select-none object-contain"
          />

          {/* Filename · provenance · position strip */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-white">
            <div className="text-sm [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.caption || current.fileName}
            </div>
            <div className="flex items-center gap-2 text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.origin === 'job' ? (
                <span>
                  {[current.workOrderNumber, current.equipmentName].filter(Boolean).join(' · ')}
                </span>
              ) : (
                <span>{siteFileChipLabel(current)}</span>
              )}
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
