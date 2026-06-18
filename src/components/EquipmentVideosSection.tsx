/* eslint-disable i18next/no-literal-string -- quick uploader/viewer on the (pre-redesign) equipment page; short operational labels stay literal. Converge on shared video primitives + glossary when this page is redesigned. */
// ─────────────────────────────────────────────────────────────────────────
// Equipment Videos — a deliberately quick uploader + viewer for the new
// work-order-service /equipment/{id}/files route (video kind). It gives
// dispatch-ui a way to upload videos before the equipment page is redesigned;
// the same files also surface on the location Files tab (the /files aggregate).
//
// Upload is the 3-step presigned flow; a confirmed video sits at PROCESSING
// (~30–60s) while it transcodes, then flips to READY with a poster + a
// cross-browser MP4 — so we poll while any tile is still processing.
// ─────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Headless from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import {
  equipmentFilesApi,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
  type WorkOrderFile,
} from '../api';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { formatTimestamp } from '../lib/formatTimestamp';
import { Button } from './catalyst/button';

const ACCEPT = VIDEO_CONTENT_TYPES.join(',');

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function EquipmentVideosSection({
  equipmentId,
  hideUpload = false,
  onOpenVideo,
}: {
  equipmentId: string;
  // The equipment Media tab provides a single shared "Add media" control, so it
  // hides this section's own upload button.
  hideUpload?: boolean;
  // When provided (equipment Media tab), clicking a video delegates "open" to
  // the parent's combined photo+video lightbox — receiving the video's index in
  // this section's list — instead of opening this section's own video-only
  // lightbox. Lets prev/next cross photos and videos.
  onOpenVideo?: (index: number) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['equipment-files', equipmentId, 'VIDEO'] as const,
    queryFn: () => equipmentFilesApi.list(equipmentId, { kind: 'VIDEO', limit: 50 }),
    // Poll while anything is still transcoding; stop once none remain.
    refetchInterval: (query) =>
      (query.state.data?.content ?? []).some((f) => f.status === 'PROCESSING') ? 4000 : false,
  });

  // FAILED videos are hidden server-side; filter defensively.
  const videos = (data?.content ?? []).filter((f) => f.status !== 'FAILED');

  const upload = useMutation({
    mutationFn: (file: File) => equipmentFilesApi.upload(equipmentId, file),
    onSuccess: (file) => {
      queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
      showSuccess(file.status === 'PROCESSING' ? 'Video uploaded — processing' : 'Video uploaded');
    },
    onError: (err) => showError('Upload failed', extractApiError(err) ?? undefined),
  });

  const del = useMutation({
    mutationFn: (fileId: string) => equipmentFilesApi.delete(equipmentId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
      showSuccess('Video deleted');
    },
    onError: (err) => showError('Couldn’t delete video', extractApiError(err) ?? undefined),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;
    if (!(VIDEO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      showError('Unsupported file', 'Pick an MP4 or QuickTime (.mov) video.');
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      showError('Video too large', 'The limit is 100 MB.');
      return;
    }
    upload.mutate(file);
  };

  return (
    <div>
      {!hideUpload && (
        <div className="mb-3 flex items-center justify-end">
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
          <Button outline onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            <PlusIcon className="size-4" />
            {upload.isPending ? 'Uploading…' : 'Upload video'}
          </Button>
        </div>
      )}

      {isError ? (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">Failed to load videos.</p>
        </div>
      ) : isLoading ? (
        <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading videos…</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No videos yet. Upload an MP4 or .mov (up to 100 MB).
          </p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {videos.map((f, i) => (
            <VideoTile
              key={f.id}
              f={f}
              onOpen={() => (onOpenVideo ? onOpenVideo(i) : setLightboxIndex(i))}
              onDelete={() => {
                if (window.confirm(`Delete ${f.fileName}?`)) del.mutate(f.id);
              }}
              deleting={del.isPending && del.variables === f.id}
            />
          ))}
        </div>
      )}

      {/* Own video-only lightbox — only when the parent isn't handling opens
          via its combined media lightbox. */}
      {!onOpenVideo && lightboxIndex !== null && videos.length > 0 && (
        <VideoLightbox
          videos={videos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function VideoTile({
  f,
  onOpen,
  onDelete,
  deleting,
}: {
  f: WorkOrderFile;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const processing = f.status === 'PROCESSING';
  return (
    <div className="group relative overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      <button
        type="button"
        onClick={processing ? undefined : onOpen}
        disabled={processing}
        aria-label={processing ? `${f.fileName} (processing)` : f.fileName}
        className="relative block aspect-square w-full bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default dark:bg-zinc-900"
      >
        {processing ? (
          <span className="flex size-full flex-col items-center justify-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <ArrowPathIcon className="size-5 animate-spin" />
            <span className="text-xs">Processing…</span>
          </span>
        ) : f.thumbnailUrl ? (
          <img
            src={f.thumbnailUrl}
            alt={f.caption ?? f.fileName}
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-90"
          />
        ) : (
          // Defensive: READY videos always carry a poster; stand-in if missing.
          <span className="flex size-full items-center justify-center text-zinc-400 dark:text-zinc-600">
            <VideoCameraIcon className="size-8" />
          </span>
        )}

        {!processing && (
          <>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-black/55 ring-1 ring-inset ring-white/25 backdrop-blur-[1px] transition group-hover:bg-black/70">
                <PlayIcon className="size-5 translate-x-px text-white" />
              </span>
            </span>
            {f.durationSeconds != null && (
              <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-white">
                {formatDuration(f.durationSeconds)}
              </span>
            )}
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Delete video"
        title="Delete video"
        className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-full bg-white/80 text-zinc-600 opacity-0 backdrop-blur transition focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100 hover:text-red-600 disabled:opacity-50 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:text-red-400"
      >
        <TrashIcon className="size-4" />
      </button>

      <div className="border-t border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="line-clamp-1 text-xs text-zinc-700 dark:text-zinc-300" title={f.fileName}>
          {f.caption || f.fileName}
        </div>
        <div className="mt-0.5 text-[10.5px] text-zinc-500 dark:text-zinc-500">
          {formatTimestamp(f.createdAt)}
          {f.workOrderNumber ? ` · ${f.workOrderNumber}` : ''}
        </div>
      </div>
    </div>
  );
}

// Inline player — dark edge-to-edge dialog, no autoplay (starts on the poster),
// button navigation, with a defensive download fallback if a clip won't load.
function VideoLightbox({
  videos,
  startIndex,
  onClose,
}: {
  videos: WorkOrderFile[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const total = videos.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = videos[safeIndex];

  return (
    <Headless.Dialog open onClose={onClose} className="relative z-50">
      <Headless.DialogBackdrop className="fixed inset-0 bg-black/85" />
      <div className="fixed inset-0 flex items-center justify-center">
        <Headless.DialogPanel className="relative flex h-full w-full flex-col items-center justify-center px-4 py-12">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <XMarkIcon className="size-6" />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex <= 0}
                aria-label="Previous"
                className="absolute left-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeftIcon className="size-7" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                disabled={safeIndex >= total - 1}
                aria-label="Next"
                className="absolute right-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRightIcon className="size-7" />
              </button>
            </>
          )}

          <VideoPlayer key={current.id} file={current} />

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-white">
            <div className="text-sm [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.caption || current.fileName}
            </div>
            <div className="flex items-center gap-2 text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {current.workOrderNumber && <span>{current.workOrderNumber}</span>}
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
        <div className="text-sm [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
          This video couldn’t be loaded.
        </div>
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
