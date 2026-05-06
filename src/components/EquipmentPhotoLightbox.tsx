import { useEffect, useState } from 'react';
import * as Headless from '@headlessui/react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { EquipmentImage } from '../api';

interface Props {
  images: EquipmentImage[];
  /** Current image index. Lightbox is closed when null. */
  startIndex: number | null;
  onClose: () => void;
}

/**
 * Full-screen image viewer with prev/next navigation. Opens when the user
 * clicks any thumbnail in EquipmentPhotosSection — single-photo equipment
 * gets a "view large" affordance, multi-photo equipment gets a flippable
 * gallery. The user can arrow-key, click on-screen arrows, click outside
 * the panel, or hit ESC to close.
 *
 * Built on Headless UI's Dialog primitive directly (not Catalyst's Dialog
 * wrapper) because the lightbox needs a dark, edge-to-edge panel with no
 * gutter — Catalyst's Dialog component frames a white card with padding
 * which fights the "image dominates the surface" intent.
 */
export default function EquipmentPhotoLightbox({ images, startIndex, onClose }: Props) {
  // Mount the inner component only when open. This way LightboxInner's
  // useState(startIndex) captures the starting position on each open without
  // needing a sync effect. Closing unmounts; reopening fresh-mounts.
  if (startIndex === null || images.length === 0) return null;
  return (
    <LightboxInner images={images} startIndex={startIndex} onClose={onClose} />
  );
}

interface InnerProps {
  images: EquipmentImage[];
  startIndex: number;
  onClose: () => void;
}

function LightboxInner({ images, startIndex, onClose }: InnerProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);

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

  // Arrow-key navigation. Headless UI handles ESC + click-outside via the
  // Dialog's onClose, so we only wire prev/next here. Skip when there's only
  // one image (no prev/next to go to).
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
          {/* Close button — top-right of the viewport, not the image. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <XMarkIcon className="size-6" />
          </button>

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

          {/* Caption + position indicator strip. Hidden when there's no
              caption AND only one image (nothing to say). */}
          {(current.caption || total > 1) && (
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-8 text-center text-white">
              {current.caption && (
                <div className="text-sm">{current.caption}</div>
              )}
              {total > 1 && (
                <div className="text-xs text-white/70">
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
