// ─────────────────────────────────────────────────────────────────
// WizardHeader.tsx — title bar with a step-pip indicator for any
// multi-step modal or panel.
//
//   <WizardHeader
//     icon={<ShieldCheckIcon className="size-3" />}
//     title="Set up two-factor"
//     step={2}
//     totalSteps={3}
//   />
//
// Visual: a recessed bar (`--bg-elev-2`) with a tinted accent square
// holding the icon, the title, and N pips on the right. The current
// step's pip elongates and fills accent; completed steps are also
// filled; upcoming steps are dim. "n/total" appears next to the pips.
//
// Sized to live as the top of a dialog body — no rounded corners of
// its own; the parent dialog provides the surface.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface WizardHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  step: number;
  totalSteps: number;
  className?: string;
}

export function WizardHeader({ title, icon, step, totalSteps, className }: WizardHeaderProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between border-b border-border-soft bg-bg-elev-2 px-5 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span className="grid size-[22px] place-items-center rounded-[5px] bg-accent-500 text-white">
            {icon}
          </span>
        )}
        <span className="text-[12.5px] font-semibold text-fg-strong">{title}</span>
      </div>
      <div className="flex items-center gap-1" aria-label={`Step ${step} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const pos = i + 1;
          const active = pos === step;
          const done = pos < step;
          return (
            <span
              key={i}
              className={clsx(
                'h-[6px] rounded-[3px] transition-[width] duration-200',
                active || done ? 'bg-accent-500' : 'bg-bg-active'
              )}
              style={{ width: active ? 18 : 6 }}
            />
          );
        })}
        <span className="ml-2 text-[10.5px] text-fg-dim">
          {step}/{totalSteps}
        </span>
      </div>
    </div>
  );
}
