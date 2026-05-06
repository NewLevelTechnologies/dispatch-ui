import { useTranslation } from 'react-i18next';
import { type EquipmentImage } from '../api';

interface Props {
  /** Sorted image list. The component renders nothing when count <= 1
   *  because the hero EquipmentThumbnail above this section already shows
   *  the only photo via click-to-lightbox; a 1-tile thumbnail row is
   *  redundant noise. The viewer-vs-manager split: this section is the
   *  viewer; the "+ Photo" button (lifted to the equipment block's
   *  actions row) is the manager. */
  images: EquipmentImage[];
  /** Cap on visible thumbnails before the +N overflow chip. Default 6 fits
   *  cleanly in the WO row expansion / quickview drawer width without wrapping. */
  maxThumbnails?: number;
  /** Click handler for thumbnails. Receives the index in `images`. The +N
   *  overflow chip jumps to the first hidden index so the parent's lightbox
   *  can flip through the entire set. The parent owns the lightbox. */
  onSelectImage: (index: number) => void;
}

/**
 * Photos sub-section nested inside the EQUIPMENT block per
 * `WORK_ORDER_DETAIL_DESIGN.md` §3.3 / §5a.
 *
 * Pure viewer: thumbnail row + count header. The thumbnail row is hidden
 * for 0 and 1 photos because the hero thumbnail already serves that case
 * via click-to-lightbox. Add / Manage / Set-as-profile / Caption / Delete
 * are the manager's job and live on the equipment block's actions row
 * and inside the lightbox toolbar — not here.
 */
export default function EquipmentPhotosSection({
  images,
  maxThumbnails = 6,
  onSelectImage,
}: Props) {
  const { t } = useTranslation();

  if (images.length <= 1) return null;

  const visible = images.slice(0, maxThumbnails);
  const overflow = images.length - visible.length;

  return (
    <section
      aria-label={t('equipment.tabs.photos')}
      className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {t('equipment.images.headingWithCount', { count: images.length })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onSelectImage(i)}
            // bg-zinc-100/-800 is the letterbox color for non-square photos —
            // object-contain preserves the full frame so CSRs see the whole
            // photo (rather than object-cover's center-crop which clips
            // nameplates / serial-tag corners). Square footprint kept so the
            // row reads as a neat grid; the bg makes the bars look intentional.
            className="block size-12 overflow-hidden rounded bg-zinc-100 ring-1 ring-zinc-950/10 hover:ring-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-800 dark:ring-white/10"
            title={img.caption ?? t('equipment.images.openFullSize')}
          >
            <img
              src={img.thumbnailUrl ?? img.url}
              alt={img.caption ?? ''}
              className="size-full object-contain"
              loading="lazy"
            />
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => onSelectImage(visible.length)}
            className="flex size-12 items-center justify-center rounded text-sm font-medium text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-blue-400"
          >
            +{overflow}
          </button>
        )}
      </div>
    </section>
  );
}
