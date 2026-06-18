/* eslint-disable i18next/no-literal-string -- equipment media viewer; a few video-only labels (Download, load-error) stay literal, matching EquipmentVideosSection. Photo actions reuse the existing equipment.images.* keys. */
import { useEffect, useRef, useState } from 'react';
import * as Headless from '@headlessui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  StarIcon as StarIconOutline,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { equipmentImagesApi, equipmentFilesApi, type EquipmentImage, type WorkOrderFile } from '../api';
import { formatTimestamp } from '../lib/formatTimestamp';

// A single viewer slot — either a photo (images API: profile + caption + delete)
// or a video (files API: delete only; caption is read-only, no patch endpoint).
export type MediaLightboxItem =
  | { kind: 'image'; image: EquipmentImage }
  | { kind: 'video'; video: WorkOrderFile };

interface Props {
  /** Equipment whose media these are — needed for the toolbar mutations. */
  equipmentId: string;
  /** Ordered media (photos then videos), so prev/next crosses all of it. */
  items: MediaLightboxItem[];
  /** Current position. Lightbox is closed when null. */
  startIndex: number | null;
  onClose: () => void;
  /** Read-only surfaces (e.g. cancelled WOs) hide every mutating action. */
  readOnly?: boolean;
}

/**
 * Full-screen viewer for the equipment Media tab + overview peek — one gallery
 * over photos AND videos so the user can arrow across everything, not just one
 * media type. Photos render as images with the full manage toolbar (set cover /
 * caption / delete); videos render in a `<video>` player with delete only.
 *
 * Distinct from the shared EquipmentPhotoLightbox (image-only, used by the
 * work-order / location / quick-view surfaces) — this one is equipment-detail
 * specific because it spans both backends.
 */
export default function EquipmentMediaLightbox({ equipmentId, items, startIndex, onClose, readOnly = false }: Props) {
  // Mount the inner component only when open so its index state captures
  // startIndex fresh on each open (close unmounts, reopen fresh-mounts).
  if (startIndex === null || items.length === 0) return null;
  return (
    <LightboxInner equipmentId={equipmentId} items={items} startIndex={startIndex} onClose={onClose} readOnly={readOnly} />
  );
}

interface InnerProps {
  equipmentId: string;
  items: MediaLightboxItem[];
  startIndex: number;
  onClose: () => void;
  readOnly: boolean;
}

function LightboxInner({ equipmentId, items, startIndex, onClose, readOnly }: InnerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(startIndex);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const captionInputRef = useRef<HTMLInputElement | null>(null);

  const total = items.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = items[safeIndex];
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const goPrev = () => {
    if (hasPrev) setIndex((i) => i - 1);
  };
  const goNext = () => {
    if (hasNext) setIndex((i) => i + 1);
  };

  // Reset inline-caption edit whenever the visible item changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsEditingCaption(false);
  }, [safeIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (isEditingCaption) {
      captionInputRef.current?.focus();
      captionInputRef.current?.select();
    }
  }, [isEditingCaption]);

  // Arrow-key navigation across all media (skipped while editing a caption).
  useEffect(() => {
    if (total <= 1 || isEditingCaption) return;
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
  }, [total, isEditingCaption]);

  const invalidateImagesAndProjections = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };

  const surfaceError = (err: unknown, fallbackKey: string) => {
    const msg =
      err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    alert(msg || t(fallbackKey));
  };

  // The deleted item drops out; if it was the only one left, close so the
  // parent's lightbox-index state clears. Otherwise the index clamps and the
  // next item slides in.
  const closeIfEmptied = () => {
    if (total === 1) onClose();
  };

  const setProfileMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.patch(equipmentId, imageId, { isProfile: true }),
    onSuccess: invalidateImagesAndProjections,
    onError: (err) => surfaceError(err, 'equipment.images.errorUpdate'),
  });

  const updateCaptionMutation = useMutation({
    mutationFn: ({ imageId, caption }: { imageId: string; caption: string | null }) =>
      equipmentImagesApi.patch(equipmentId, imageId, { caption }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] }),
    onError: (err) => surfaceError(err, 'equipment.images.errorUpdate'),
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.delete(equipmentId, imageId),
    onSuccess: () => {
      invalidateImagesAndProjections();
      closeIfEmptied();
    },
    onError: (err) => surfaceError(err, 'equipment.images.errorDelete'),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: (fileId: string) => equipmentFilesApi.delete(equipmentId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
      closeIfEmptied();
    },
    onError: (err) => surfaceError(err, 'equipment.images.errorDelete'),
  });

  const handleSetProfile = () => {
    if (current.kind !== 'image' || current.image.isProfile) return;
    setProfileMutation.mutate(current.image.id);
  };

  const handleDelete = () => {
    if (!window.confirm(t('equipment.images.deleteConfirm'))) return;
    if (current.kind === 'image') deleteImageMutation.mutate(current.image.id);
    else deleteVideoMutation.mutate(current.video.id);
  };

  const startCaptionEdit = () => {
    if (readOnly || current.kind !== 'image') return;
    setCaptionDraft(current.image.caption ?? '');
    setIsEditingCaption(true);
  };

  const commitCaption = () => {
    if (current.kind !== 'image') return;
    const next = captionDraft.trim();
    const prev = current.image.caption ?? '';
    if (next === prev) {
      setIsEditingCaption(false);
      return;
    }
    updateCaptionMutation.mutate({ imageId: current.image.id, caption: next === '' ? null : next });
    setIsEditingCaption(false);
  };

  const cancelCaption = () => {
    setIsEditingCaption(false);
    if (current.kind === 'image') setCaptionDraft(current.image.caption ?? '');
  };

  const isImage = current.kind === 'image';
  const caption = isImage ? current.image.caption : (current.video.caption ?? current.video.fileName);
  const deletePending = deleteImageMutation.isPending || deleteVideoMutation.isPending;

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
          {/* Top-right toolbar — manage actions left, close right. */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {!readOnly && (
              <>
                {/* Set-as-cover is photos only — a video can't be the profile image. */}
                {isImage &&
                  (current.image.isProfile ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 ring-1 ring-inset ring-amber-400/30">
                      <StarIconSolid className="size-4" />
                      {t('equipment.images.profile')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSetProfile}
                      disabled={setProfileMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <StarIconOutline className="size-4" />
                      {t('equipment.images.setAsProfile')}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deletePending}
                  aria-label={t('common.delete')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon className="size-4" />
                  {t('common.delete')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <XMarkIcon className="size-6" />
            </button>
          </div>

          {/* Prev/next — across all media. */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={!hasPrev}
                aria-label={t('common.previous')}
                className="absolute left-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronLeftIcon className="size-7" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasNext}
                aria-label={t('common.next')}
                className="absolute right-4 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronRightIcon className="size-7" />
              </button>
            </>
          )}

          {/* The media itself — image or video player, sized to fit. key on the
              item id so React swaps the element (and resets <video>) on nav. */}
          {isImage ? (
            <img
              key={current.image.id}
              src={current.image.url}
              alt={current.image.caption ?? ''}
              className="max-h-full max-w-full select-none object-contain"
            />
          ) : (
            <VideoPlayer key={current.video.id} file={current.video} />
          )}

          {/* Caption + position strip. Photo captions are click-to-edit; video
              captions are read-only (no files caption endpoint yet). */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-white">
            {isImage && isEditingCaption ? (
              <input
                ref={captionInputRef}
                type="text"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                onBlur={commitCaption}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitCaption();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelCaption();
                  }
                }}
                placeholder={t('equipment.images.captionPlaceholder')}
                aria-label={t('equipment.images.editCaption')}
                className="w-full max-w-md rounded border border-white/40 bg-black/50 px-3 py-1.5 text-center text-sm text-white placeholder-white/60 focus:border-white/70 focus:outline-none"
              />
            ) : caption ? (
              <button
                type="button"
                onClick={startCaptionEdit}
                disabled={readOnly || !isImage}
                className="rounded px-2 py-0.5 text-sm text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)] hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {caption}
              </button>
            ) : (
              !readOnly &&
              isImage && (
                <button
                  type="button"
                  onClick={startCaptionEdit}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white ring-1 ring-inset ring-white/20 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <PlusIcon className="size-4" />
                  {t('equipment.images.addCaption')}
                </button>
              )
            )}
            {/* Video meta line (WO link + date) + position-across-all indicator. */}
            {(!isImage || total > 1) && (
              <div className="flex items-center gap-2 text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
                {!isImage && current.video.workOrderNumber && <span>{current.video.workOrderNumber}</span>}
                {!isImage && <span>· {formatTimestamp(current.video.createdAt)}</span>}
                {total > 1 && (
                  <span className="font-mono tabular-nums">
                    {!isImage ? '· ' : ''}
                    {t('equipment.images.lightboxPosition', { current: safeIndex + 1, total })}
                  </span>
                )}
              </div>
            )}
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  );
}

// Video element with a defensive download fallback if a clip won't load.
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
