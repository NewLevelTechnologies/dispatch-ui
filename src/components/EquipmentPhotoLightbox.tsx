import { useEffect, useRef, useState } from 'react';
import * as Headless from '@headlessui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  StarIcon as StarIconOutline,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { equipmentImagesApi, type EquipmentImage } from '../api';

interface Props {
  /** Equipment whose photos these are. Required for the toolbar's mutations
   *  (set-as-profile, update caption, delete) and cache invalidation. */
  equipmentId: string;
  images: EquipmentImage[];
  /** Current image index. Lightbox is closed when null. */
  startIndex: number | null;
  onClose: () => void;
  /** When true, the toolbar collapses to prev/next/close only — Set-as-
   *  profile, Caption edit, and Delete are suppressed. Used on cancelled
   *  / archived WOs where the entire equipment block is read-only. */
  readOnly?: boolean;
}

/**
 * Full-screen image viewer + manager. Opens when the user clicks any
 * thumbnail in EquipmentPhotosSection (or the equipment hero thumbnail).
 * Single-photo equipment gets a "view large" affordance; multi-photo
 * equipment gets a flippable gallery.
 *
 * Toolbar (top-right): set-as-profile / "Profile" badge · delete · close.
 * Caption is inline-editable below the image (click → input → save on
 * Enter/blur, revert on Esc). All mutations route through the existing
 * `equipmentImagesApi` and invalidate the same query keys
 * EquipmentDetailPage uses, so edits are coherent across surfaces.
 *
 * Built on Headless UI's Dialog primitive directly (not Catalyst's Dialog
 * wrapper) because the lightbox needs a dark, edge-to-edge panel with no
 * gutter.
 */
export default function EquipmentPhotoLightbox({
  equipmentId,
  images,
  startIndex,
  onClose,
  readOnly = false,
}: Props) {
  // Mount the inner component only when open. This way LightboxInner's
  // useState(startIndex) captures the starting position on each open without
  // needing a sync effect. Closing unmounts; reopening fresh-mounts.
  if (startIndex === null || images.length === 0) return null;
  return (
    <LightboxInner
      equipmentId={equipmentId}
      images={images}
      startIndex={startIndex}
      onClose={onClose}
      readOnly={readOnly}
    />
  );
}

interface InnerProps {
  equipmentId: string;
  images: EquipmentImage[];
  startIndex: number;
  onClose: () => void;
  readOnly: boolean;
}

function LightboxInner({
  equipmentId,
  images,
  startIndex,
  onClose,
  readOnly,
}: InnerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(startIndex);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const captionInputRef = useRef<HTMLInputElement | null>(null);

  const total = images.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = images[safeIndex];
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const goPrev = () => {
    if (hasPrev) setIndex((i) => i - 1);
  };
  const goNext = () => {
    if (hasNext) setIndex((i) => i + 1);
  };

  // Reset inline-caption edit state whenever the user navigates to a
  // different photo. Otherwise an in-flight edit on photo A would leak its
  // draft into photo B's display when arrowed across. setState in effect
  // is intentional here — reconciling local UI state with a prop-derived
  // index change is the standard exception (matches the same pattern on
  // EquipmentDetailPage).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsEditingCaption(false);
  }, [safeIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus + select the caption input when entering edit mode.
  useEffect(() => {
    if (isEditingCaption) {
      captionInputRef.current?.focus();
      captionInputRef.current?.select();
    }
  }, [isEditingCaption]);

  // Arrow-key navigation. Headless UI handles ESC + click-outside via the
  // Dialog's onClose, so we only wire prev/next here. Skip when there's only
  // one image (no prev/next to go to) OR the caption editor is active
  // (arrow keys belong to text editing then).
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

  // Set-as-profile and Delete affect the projected profileImageUrl on
  // WorkItemEquipmentSummary and EquipmentSummary, so they need the broad
  // prefix bust. Caption only surfaces inside the lightbox, so a tighter
  // invalidation suffices.
  const invalidateImagesOnly = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] });
  };
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

  const setProfileMutation = useMutation({
    mutationFn: (imageId: string) =>
      equipmentImagesApi.patch(equipmentId, imageId, { isProfile: true }),
    onSuccess: invalidateImagesAndProjections,
    onError: (err) => surfaceError(err, 'equipment.images.errorUpdate'),
  });

  const updateCaptionMutation = useMutation({
    mutationFn: ({ imageId, caption }: { imageId: string; caption: string | null }) =>
      equipmentImagesApi.patch(equipmentId, imageId, { caption }),
    onSuccess: invalidateImagesOnly,
    onError: (err) => surfaceError(err, 'equipment.images.errorUpdate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.delete(equipmentId, imageId),
    // The image list shrinks by one; the local index stays put so the
    // photo that was at index+1 slides in. Math.min in safeIndex handles
    // the deleted-last-image case (steps back). When count goes 1 → 0 we
    // close the lightbox so the parent's lightboxIndex state clears.
    onSuccess: () => {
      const wasLast = total === 1;
      invalidateImagesAndProjections();
      if (wasLast) onClose();
    },
    onError: (err) => surfaceError(err, 'equipment.images.errorDelete'),
  });

  const handleSetProfile = () => {
    if (current.isProfile) return;
    setProfileMutation.mutate(current.id);
  };

  const handleDelete = () => {
    if (!window.confirm(t('equipment.images.deleteConfirm'))) return;
    deleteMutation.mutate(current.id);
  };

  const startCaptionEdit = () => {
    if (readOnly) return;
    setCaptionDraft(current.caption ?? '');
    setIsEditingCaption(true);
  };

  const commitCaption = () => {
    const next = captionDraft.trim();
    const prev = current.caption ?? '';
    if (next === prev) {
      setIsEditingCaption(false);
      return;
    }
    updateCaptionMutation.mutate({
      imageId: current.id,
      caption: next === '' ? null : next,
    });
    setIsEditingCaption(false);
  };

  const cancelCaption = () => {
    setIsEditingCaption(false);
    setCaptionDraft(current.caption ?? '');
  };

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
          {/* Top-right toolbar — manage actions left, close right.
              In readOnly mode only the close button renders. */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {!readOnly && (
              <>
                {current.isProfile ? (
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
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
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

          {/* Prev/next arrows — only render when there's somewhere to go. */}
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

          {/* The image itself. Sized to fit the viewport while leaving room
              for the controls + caption strip. object-contain preserves
              aspect ratio so portraits and landscapes both fit. */}
          <img
            src={current.url}
            alt={current.caption ?? ''}
            className="max-h-full max-w-full select-none object-contain"
          />

          {/* Caption + position indicator strip. Caption is click-to-edit
              when not readOnly. The strip is always rendered when there's
              content to show OR when caption is editable (so the empty-
              caption affordance is reachable on multi-photo equipment that
              still has no caption metadata). */}
          {(current.caption || total > 1 || !readOnly) && (
            // Stronger gradient + via stop so the band where the caption
            // actually sits reads as ~55% black against the worst-case
            // sun-on-concrete photo. Without the via stop the linear
            // interpolation is too pale at caption height.
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-white">
              {isEditingCaption ? (
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
                  // bg-black/50 (not white/10) so the input is its own
                  // legible dark surface regardless of what photo's behind
                  // it. White-bg-against-light-photo had the text and
                  // placeholder camouflaging into the image.
                  className="w-full max-w-md rounded border border-white/40 bg-black/50 px-3 py-1.5 text-center text-sm text-white placeholder-white/60 focus:border-white/70 focus:outline-none"
                />
              ) : current.caption ? (
                <button
                  type="button"
                  onClick={startCaptionEdit}
                  disabled={readOnly}
                  // Drop-shadow on the text so it stays legible if the
                  // gradient still loses to a particularly bright photo.
                  className="rounded px-2 py-0.5 text-sm text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)] hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {current.caption}
                </button>
              ) : (
                !readOnly && (
                  // Empty-state CTA: chip styling matches the top toolbar
                  // buttons so it reads as "this is a control, not a label"
                  // when sitting over a busy photo. The populated caption
                  // case (above) doesn't need this because the caption text
                  // itself is the content/anchor.
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
              {total > 1 && (
                <div className="text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
                  {t('equipment.images.lightboxPosition', {
                    current: safeIndex + 1,
                    total,
                  })}
                </div>
              )}
            </div>
          )}
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  );
}
