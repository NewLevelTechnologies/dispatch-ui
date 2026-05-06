import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { equipmentImagesApi, type EquipmentImage } from '../api';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';

interface Props {
  equipmentId: string;
  /** Cap on visible thumbnails before the +N overflow chip. Default 6 fits
   *  cleanly in the WO row expansion / quickview drawer width without wrapping. */
  maxThumbnails?: number;
  /** Optional pre-loaded list — when provided, skip the lazy fetch. The
   *  EquipmentQuickViewDrawer already has images embedded on its
   *  EquipmentResponse fetch and can pass them in to avoid a duplicate
   *  request. */
  images?: EquipmentImage[];
}

/**
 * Photos sub-section nested inside the EQUIPMENT block per
 * `WORK_ORDER_DETAIL_DESIGN.md` §3.3 / §5a. Renders nothing when the
 * equipment has no images — design says "Hides when empty" because a
 * "0 photos" placeholder communicates noise on the dominant case (CSR
 * scanning a row to find the equipment, not auditing photo coverage).
 *
 * Lazy-loaded via the standalone `/equipment/{id}/images` endpoint so
 * the WO row expansion only pays for the fetch when the user expands a
 * row with linked equipment. Cache key matches `EquipmentDetailPage` so
 * uploads on the dedicated page invalidate this surface in lockstep.
 */
export default function EquipmentPhotosSection({
  equipmentId,
  maxThumbnails = 6,
  images: providedImages,
}: Props) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Fetch only when the parent didn't supply images. React Query treats
  // `enabled: false` as "use whatever's in cache, never refetch" — fine here
  // because the prop path means the parent already has the data fresh.
  const { data: fetchedImages } = useQuery({
    queryKey: ['equipment-images', equipmentId],
    queryFn: () => equipmentImagesApi.list(equipmentId),
    enabled: !providedImages,
  });

  const images = providedImages ?? fetchedImages;
  if (!images || images.length === 0) return null;

  // Profile-first then sortOrder is the contract from the API; defensively
  // sort here so callers passing a raw images[] still get the expected order.
  const ordered = [...images].sort((a, b) => {
    if (a.isProfile && !b.isProfile) return -1;
    if (!a.isProfile && b.isProfile) return 1;
    return a.sortOrder - b.sortOrder;
  });
  const visible = ordered.slice(0, maxThumbnails);
  const overflow = ordered.length - visible.length;

  return (
    <section
      aria-label={t('equipment.tabs.photos')}
      className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('equipment.images.headingWithCount', { count: ordered.length })}
        </div>
        <RouterLink
          to={`/equipment/${equipmentId}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowTopRightOnSquareIcon className="size-4" />
          {t('equipment.images.manage')}
        </RouterLink>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="block size-12 overflow-hidden rounded ring-1 ring-zinc-950/10 hover:ring-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:ring-white/10"
            title={img.caption ?? t('equipment.images.openFullSize')}
          >
            <img
              src={img.thumbnailUrl ?? img.url}
              alt={img.caption ?? ''}
              className="size-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
        {overflow > 0 && (
          // The +N chip jumps into the lightbox at the first hidden image —
          // CSRs can flip through every photo without leaving context. The
          // "Manage" link in the section header still routes to the
          // equipment page when they want to edit/upload.
          <button
            type="button"
            onClick={() => setLightboxIndex(visible.length)}
            className="flex size-12 items-center justify-center rounded text-sm font-medium text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-blue-400"
          >
            +{overflow}
          </button>
        )}
      </div>

      <EquipmentPhotoLightbox
        images={ordered}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </section>
  );
}
