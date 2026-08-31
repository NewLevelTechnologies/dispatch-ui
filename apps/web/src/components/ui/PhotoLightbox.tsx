// ─────────────────────────────────────────────────────────────────
// PhotoLightbox.tsx — minimal single-photo viewer.
//
// Dark edge-to-edge panel, close button, ESC / click-outside via the
// Headless Dialog. View-only by design — galleries and manage actions
// (set-as-profile, delete, prev/next) belong to the richer lightboxes
// (LocationFilesTab, EquipmentPhotoLightbox); this is for "one image,
// click to see it big" surfaces like the site-photo banner.
//
//   <PhotoLightbox open={open} onClose={...} src={url} alt="Site photo"
//     caption="Site photo" />
// ─────────────────────────────────────────────────────────────────
import * as Headless from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export function PhotoLightbox({
  open,
  onClose,
  src,
  alt,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  caption?: string;
}) {
  if (!open) return null;
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <XMarkIcon className="size-6" />
          </button>
          <img src={src} alt={alt} className="max-h-full max-w-full select-none object-contain" />
          {caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-center text-sm text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_60%)]">
              {caption}
            </div>
          )}
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  );
}
