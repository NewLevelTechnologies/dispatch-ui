import { PhotoIcon } from '@heroicons/react/24/outline';

interface EquipmentThumbnailProps {
  /** Presigned S3 URL of the profile image; null/undefined falls back to a placeholder. */
  url?: string | null;
  /** Used as the alt text and the monogram fallback source. */
  name: string;
  /**
   * Equipment CATEGORY — the specific child (Condenser, Air Handler, Water
   * Heater). When `monogram` is on and there's no photo, category drives the
   * monogram letters and hue. Category (not type) is the seed on purpose: type
   * is the broad parent (HVAC), so every unit would collapse to identical "HV"
   * tiles — category gives "CO"/"AH"/"WH" and a distinct hue per kind.
   */
  category?: string | null;
  /**
   * Equipment type label — the broad parent (HVAC). Only a fallback seed for the
   * monogram/hue when `category` is absent (prefer passing `category`).
   */
  type?: string | null;
  /**
   * Opt in to a photo-OR-monogram tile (the `EqThumbBox` behavior). With no
   * photo, renders a type/name-derived monogram on a stable hue instead of the
   * neutral icon. Opt-in so non-equipment reuse (e.g. file thumbnails) keeps the
   * plain icon placeholder.
   */
  monogram?: boolean;
  /** Tailwind size class (size-8, size-10, size-12). Defaults to size-9 (~36px). */
  sizeClass?: string;
  /**
   * How the image fits its square container.
   * - `cover` (default): crop to fill — tight in grids/lists where consistent shape matters.
   * - `contain`: letterbox to show the whole image — better for header/preview surfaces.
   */
  fit?: 'cover' | 'contain';
  /** Extra wrapper classes (margins, hover states). */
  className?: string;
}

/**
 * Compact equipment image thumbnail used in list/table contexts. Renders the
 * profile image when present. With `monogram` on, a photo-less unit shows a
 * type-derived monogram tile (never a blank box); otherwise it falls back to a
 * neutral placeholder icon. Square aspect, rounded corners, with a subtle ring
 * so it reads as an image even when the placeholder is shown against a
 * similar-toned background.
 *
 * Note: the wrapper is intentionally a plain block (not flex) so the inner
 * <img>'s `size-full + object-cover` can fill the box correctly. The
 * placeholder branch carries its own flex centering.
 */
export default function EquipmentThumbnail({
  url,
  name,
  category,
  type,
  monogram = false,
  sizeClass = 'size-9',
  fit = 'cover',
  className = '',
}: EquipmentThumbnailProps) {
  const showMonogram = !url && monogram;

  if (showMonogram) {
    // Category-first seed (the specific child) so units of the same type don't
    // collapse to one monogram/hue; type/name are fallbacks.
    const seed = (category?.trim() || type?.trim() || name?.trim() || '').toString();
    const hue = hueFromString(seed);
    return (
      <div
        className={[sizeClass, 'shrink-0 overflow-hidden rounded-md', className]
          .filter(Boolean)
          .join(' ')}
        style={{ background: `oklch(58% 0.12 ${hue})` }}
        role="img"
        aria-label={name}
      >
        {/* SVG text auto-scales with the box, so one component serves every
            sizeClass (size-5 chips → size-16 heroes) without a per-size font. */}
        <svg viewBox="0 0 100 100" className="block size-full" aria-hidden="true">
          <text
            x="50"
            y="55"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="44"
            fontWeight="700"
            fill="#ffffff"
            style={{ fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)' }}
          >
            {monogramText(category ?? type, name)}
          </text>
        </svg>
      </div>
    );
  }

  // When the image is letterboxed (contain), the background and ring become
  // visible chrome around the photo and look like padding. Drop them so the
  // image sits "in space." Cover mode keeps the chrome — img fills the box,
  // chrome only matters when the photo is missing or while it loads.
  const showChrome = !url || fit !== 'contain';
  return (
    <div
      className={[
        sizeClass,
        'shrink-0 overflow-hidden rounded-md',
        showChrome
          ? 'bg-zinc-100 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10'
          : '',
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
          className={`block size-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
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

/**
 * 1–2 letter monogram from the equipment category (preferred — the specific
 * child differentiates units) or the name. Two words → first initial of each;
 * one word → first two letters. Never empty: the name fallback guarantees a glyph.
 */
function monogramText(seed?: string | null, name?: string | null): string {
  const src = (seed?.trim() || name?.trim() || '').toString();
  if (!src) return '?';
  const words = src.split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

/** Deterministic hue (0–359) from a string, so a given type/name is always the same color. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}
