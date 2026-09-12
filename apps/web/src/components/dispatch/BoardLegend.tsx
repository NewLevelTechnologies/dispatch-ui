// ─────────────────────────────────────────────────────────────────────
// What the grid's colours mean.
//
// The board encodes a lot in very little ink — a hue for status, a dashed
// border for "not handed over", an outline for "no estimate", a pulse for
// "on site right now". A dispatcher learns those in a week, but they have to
// learn them from somewhere, and the alternative is a tooltip on every block.
//
// Tones come from the same variables the blocks use, so the legend cannot
// drift from the thing it explains.
// ─────────────────────────────────────────────────────────────────────
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../../contexts/GlossaryContext';

function Item({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {swatch}
      {label}
    </span>
  );
}

function Fill({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />;
}

export default function BoardLegend() {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-fg-muted">
      <Item swatch={<Fill color="var(--info-500)" />} label={t('dispatchBoard.legend.scheduled')} />
      <Item swatch={<Fill color="var(--violet-500)" />} label={t('dispatchBoard.legend.live')} />
      <Item swatch={<Fill color="var(--success-500)" />} label={t('dispatchBoard.legend.completed')} />
      <Item swatch={<Fill color="var(--warning-500)" />} label={t('dispatchBoard.legend.noShow')} />
      {/* Dashed, not filled: "not handed over" is orthogonal to status, so it
          cannot be another hue without colliding with one. */}
      <Item
        swatch={
          <span className="size-2 shrink-0 rounded-[2px] border border-dashed border-fg-muted" />
        }
        label={t('dispatchBoard.legend.unreleased')}
      />
      {/* Wider than it is tall, because what it describes is a block with no
          fill inside it rather than a swatch of colour. */}
      <Item
        swatch={
          <span className="h-2 w-3 shrink-0 rounded-[2px] border border-border-strong" />
        }
        label={t('dispatchBoard.legend.noEstimate')}
      />
      <Item
        swatch={<span className="size-[5px] shrink-0 rounded-full bg-violet-500" />}
        label={t('dispatchBoard.legend.onSiteNow', { entity: getName('technician').toLowerCase() })}
      />
    </div>
  );
}
