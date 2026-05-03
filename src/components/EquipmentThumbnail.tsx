import { PhotoIcon } from '@heroicons/react/24/outline';

interface EquipmentThumbnailProps {
  /** Presigned S3 URL of the profile image; null/undefined falls back to a placeholder. */
  url?: string | null;
  /** Used as the alt text and the placeholder's aria-label. */
  name: string;
  /** Tailwind size class (size-8, size-10, size-12). Defaults to size-9 (~36px). */
  sizeClass?: string;
  /** Extra wrapper classes (margins, hover states). */
  className?: string;
}

/**
 * Compact equipment image thumbnail used in list/table contexts. Renders the
 * profile image when present, otherwise a neutral placeholder icon. Square
 * aspect, rounded corners, with a subtle ring so it reads as an image even
 * when the placeholder is shown against a similar-toned background.
 *
 * Note: the wrapper is intentionally a plain block (not flex) so the inner
 * <img>'s `size-full + object-cover` can fill the box correctly. The
 * placeholder branch carries its own flex centering.
 */
export default function EquipmentThumbnail({
  url,
  name,
  sizeClass = 'size-9',
  className = '',
}: EquipmentThumbnailProps) {
  return (
    <div
      className={[
        sizeClass,
        'shrink-0 overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="block size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <PhotoIcon
            className="size-1/2 text-zinc-300 dark:text-zinc-700"
            aria-label={name}
          />
        </div>
      )}
    </div>
  );
}
