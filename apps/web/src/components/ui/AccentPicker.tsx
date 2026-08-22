// ─────────────────────────────────────────────────────────────────
// AccentPicker.tsx — 10-swatch palette picker shared by Roles and
// Work Order Types. Stores an accent id token, never a raw color
// value, so renames and theme swaps stay stable.
//
//   <AccentPicker
//     value={accentId}
//     onChange={setAccentId}
//     colorsInUse={colorsInUse}
//     formatTakenLabel={(name) => `Used by ${name}`}
//   />
//
// `colorsInUse` keys swatch ids → arbitrary owner records. The
// picker dims + disables those swatches and surfaces the owner via
// the native title tooltip. Callers are expected to filter the
// current entity's own entry out in edit mode (so the user can keep
// their existing color).
// ─────────────────────────────────────────────────────────────────
import { ROLE_ACCENT_OPTIONS, type AccentOption } from '../../utils/roleColor';

interface Props<TOwner> {
  value: string;
  onChange: (id: string) => void;
  options?: AccentOption[];
  colorsInUse?: Record<string, TOwner>;
  // Localized formatter for the disabled-swatch tooltip. Receives
  // the owner record so callers can pull whichever name field they
  // store ({ roleName } vs { typeName } etc.).
  formatTakenLabel?: (owner: TOwner) => string;
}

export function AccentPicker<TOwner>({
  value,
  onChange,
  options = ROLE_ACCENT_OPTIONS,
  colorsInUse,
  formatTakenLabel,
}: Props<TOwner>) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const on = opt.id === value;
        const owner = colorsInUse?.[opt.id];
        const taken = !!owner && !on;
        const title = taken && formatTakenLabel && owner
          ? formatTakenLabel(owner)
          : opt.label;
        return (
          <button
            key={opt.id}
            type="button"
            aria-label={opt.label}
            title={title}
            disabled={taken}
            onClick={() => !taken && onChange(opt.id)}
            className={
              'inline-flex size-[26px] items-center justify-center rounded-[7px] bg-bg-elev-2 p-0 transition-colors ' +
              (on
                ? 'border-[1.5px] border-fg-strong'
                : taken
                  ? 'cursor-not-allowed border-[1.5px] border-border opacity-35'
                  : 'border-[1.5px] border-border hover:border-border-strong')
            }
          >
            <span
              className="size-3.5 rounded-full"
              style={{
                background: opt.value,
                boxShadow: on
                  ? `0 0 0 2px color-mix(in oklch, ${opt.value} 20%, transparent)`
                  : 'none',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
