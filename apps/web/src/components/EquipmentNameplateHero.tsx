/* eslint-disable i18next/no-literal-string -- outcome-led nameplate copy is fixed product language (see add-edit-equipment.md); kept literal like the equipment form it sits in. */
import { useRef } from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';
import { Button } from './catalyst/button';

// Nameplate OCR hero — the add form's primary fill path. Idle → reading → done.
// Pure presentation: it owns the file picker + states; the parent runs the
// extraction and pre-fills the form. "Auto-fill from the nameplate", never
// "scan" (this is photo → OCR → a read the tech verifies, not a barcode decode).
export function EquipmentNameplateHero({
  state,
  error,
  warnings,
  onPick,
  onReset,
}: {
  state: 'idle' | 'reading' | 'done';
  error?: string | null;
  warnings?: string[];
  onPick: (file: File) => void;
  onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Hidden input drives both states; reset re-uses it for "Replace photo".
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Clear the value so picking the same file again still fires onChange.
        e.target.value = '';
        if (file) onPick(file);
      }}
    />
  );

  if (state === 'done') {
    return (
      <div
        className="mb-3.5 flex items-center gap-3 rounded-[10px] px-3.5 py-2.5"
        style={{
          background: 'color-mix(in oklch, var(--success-500) 7%, var(--bg-elev))',
          border: '1px solid color-mix(in oklch, var(--success-500) 32%, var(--border))',
        }}
      >
        {fileInput}
        <div className="grid size-[38px] shrink-0 place-items-center rounded-[8px] border border-border-soft bg-bg-active text-fg-dim">
          <CameraIcon className="size-[17px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg-strong">Filled from the nameplate</div>
          <div className="text-[11.5px] text-fg-muted">
            Review the flagged fields — confirm the serial — then add a name and save.
          </div>
          {warnings && warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-warning-fg">⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
        <Button plain size="xs" type="button" onClick={onReset}>
          Replace photo
        </Button>
      </div>
    );
  }

  const reading = state === 'reading';
  return (
    <div className="mb-3.5">
      <div
        className="flex items-center gap-3.5 rounded-[10px] p-4"
        style={{
          background: 'color-mix(in oklch, var(--accent-500) 5%, var(--bg-elev))',
          border: '1.5px dashed color-mix(in oklch, var(--accent-500) 40%, var(--border))',
        }}
      >
        {fileInput}
        <div
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-fg-accent"
          style={{ background: 'color-mix(in oklch, var(--accent-500) 14%, transparent)' }}
        >
          <CameraIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-fg-strong">
            {reading ? 'Reading the nameplate…' : 'Auto-fill from the nameplate'}
          </div>
          <div className="mt-0.5 text-[11.5px] text-fg-muted">
            {reading
              ? 'Reading make, model, serial and specs from your photo…'
              : 'Upload a photo of the data plate — we’ll read make, model, serial and specs. Or enter details manually below.'}
          </div>
        </div>
        <Button
          color="accent"
          size="xs"
          type="button"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
        >
          {reading ? 'Reading…' : 'Upload photo'}
        </Button>
      </div>
      {error && <div className="mt-1.5 text-[11.5px] text-danger-500">{error}</div>}
    </div>
  );
}
