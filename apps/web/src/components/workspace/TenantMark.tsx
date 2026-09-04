// The single mark for a workspace, everywhere one appears: the sidebar
// trigger, the switcher rows, the picker, the access-removed list, and the
// switching overlay.
//
// One component on purpose. Callers must never branch on `logoUrl` themselves
// — that branch is exactly how one company ends up wearing a logo in the
// trigger and a monogram in the row directly below it.
import { useState } from 'react';
import { tenantMonogram } from './monogram';

interface Props {
  name: string;
  /** Thumbnail rendition. Absent for workspaces other than the active one. */
  logoUrl?: string | null;
  size?: number;
  /** The active workspace. Marked with a ring, never a fill — see below. */
  current?: boolean;
  /**
   * Rendered on the sidebar rail rather than a themed surface.
   *
   * The rail is dark in both themes, but the monogram's surface tokens follow
   * the theme — so on light mode `--bg-active` is near-white and the mark
   * became a pale chip on a dark rail. Branching on the surface is fine; the
   * rule that matters is never branching on whether a logo exists.
   */
  onDark?: boolean;
}

export default function TenantMark({
  name,
  logoUrl,
  size = 28,
  current = false,
  onDark = false,
}: Props) {
  // A logo that 404s must not leave a hole where identity should be.
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-md border"
        style={{
          width: size,
          height: size,
          // Always a light plate with a hairline. Tenant logos are authored for
          // white letterhead, so a tinted or dark field muddies them — and the
          // border is what keeps a white-on-white logo from reading as an empty
          // box.
          background: 'var(--bg-elev)',
          // Active state is a RING rather than a fill: it sits outside the
          // artwork instead of behind it, so it cannot fight the logo's own
          // colours. That is what lets logos be used in every position.
          borderColor: current ? 'var(--accent-500)' : 'var(--border)',
          boxShadow: current
            ? '0 0 0 1.5px color-mix(in oklch, var(--accent-500) 40%, transparent)'
            : 'none',
        }}
      >
        {/* contain, never cover: a wide wordmark and a square badge both have
            to survive the same square without cropping. */}
        <img
          src={logoUrl}
          alt=""
          onError={() => setFailed(true)}
          className="block size-full object-contain p-0.5"
        />
      </span>
    );
  }

  // On the rail, the accent gradient — it reads as brand rather than as a
  // disabled chip, and it recolours with the accent for free.
  if (onDark) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent-500 to-accent-700 font-bold text-white shadow-sm"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      >
        {tenantMonogram(name)}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-md font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        // With no artwork to fight, the active state can take the stronger
        // treatment. `--fg` rather than `--fg-muted` when idle: two bold
        // letters at this size need more than the ~4.9:1 the muted ramp gives
        // against `--bg-active`, since the AA ratio assumes roughly 14px.
        background: current ? 'var(--accent-500)' : 'var(--bg-active)',
        color: current ? 'white' : 'var(--fg)',
      }}
    >
      {tenantMonogram(name)}
    </span>
  );
}
