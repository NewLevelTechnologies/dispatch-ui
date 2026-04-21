/* eslint-disable i18next/no-literal-string -- design-evaluation tool; palette names are technical identifiers, not user-facing copy */
import { useEffect, useState } from 'react';

const PALETTES = ['catalyst', 'slate', 'noir', 'warm', 'ops', 'forest', 'steel'] as const;
type Palette = (typeof PALETTES)[number];

const STORAGE_KEY = 'palette';

function readStored(): Palette {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (PALETTES as readonly string[]).includes(stored ?? '')
    ? (stored as Palette)
    : 'catalyst';
}

export function PaletteSwitcher() {
  const [palette, setPalette] = useState<Palette>(readStored);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem(STORAGE_KEY, palette);
  }, [palette]);

  return (
    <div className="fixed right-3 bottom-3 z-50 flex items-center gap-1 rounded-full border border-border-default bg-surface-raised/90 px-1.5 py-1 text-[11px] shadow-lg backdrop-blur">
      <span className="px-1.5 font-mono uppercase tracking-wider text-text-tertiary">
        palette
      </span>
      {PALETTES.map((p) => {
        const active = palette === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => setPalette(p)}
            className={
              active
                ? 'rounded-full bg-accent px-2 py-0.5 font-mono text-text-inverted'
                : 'rounded-full px-2 py-0.5 font-mono text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
            }
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
