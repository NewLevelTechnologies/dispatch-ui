import { useEffect, useRef, useState } from 'react';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Textarea } from './catalyst/textarea';

/**
 * Click-to-edit field swapper called out as a phase-5 custom component in the
 * WO detail design (§3.8). Renders the value as text; on click swaps to the
 * editing surface; saves on blur or Enter; reverts on Esc.
 *
 * Three variants:
 *   - `text`     → single-line `<Input>`. Enter saves.
 *   - `textarea` → multi-line `<Textarea>`. Cmd/Ctrl+Enter saves; plain Enter inserts a newline.
 *   - `select`   → `<Select>` with options. Change saves immediately (no need for blur).
 *
 * The component is "controlled-by-parent for value, internal-state-for-editing":
 * parent passes `value`, component manages editing internally, calls `onSave`
 * with the new value when committed. Parent decides when `value` updates
 * (typically by invalidating the query that supplied it).
 */

interface BaseProps {
  /** Current saved value. Component re-renders display when this changes. */
  value: string;
  /**
   * Called with the new value when the user commits an edit. May be async.
   * If it throws, the component stays in edit mode so the user can retry
   * or cancel — parent should surface the error (e.g. via `alert`).
   */
  onSave: (next: string) => void | Promise<void>;
  /** When true, click does nothing. Component renders as plain text. */
  disabled?: boolean;
  /** Shown in the input when editing and `value` is empty. */
  placeholder?: string;
  /** Display fallback when `value` is empty / missing. Defaults to '—'. */
  emptyDisplay?: string;
  /** Optional aria-label for assistive tech (defaults to placeholder when set). */
  ariaLabel?: string;
  /** Class applied to the *display* (read mode) span. */
  className?: string;
  /**
   * Optional custom renderer for the display (read) state. Use when you want a
   * Badge or other styled element shown when not editing — e.g. priority
   * renders as a colored Badge in display mode but an <option> dropdown in edit
   * mode. When omitted, falls back to plain text (option label for `select`).
   */
  renderDisplay?: (value: string) => React.ReactNode;
}

interface TextProps extends BaseProps {
  as?: 'text';
}

interface TextareaProps extends BaseProps {
  as: 'textarea';
  rows?: number;
}

interface SelectProps extends BaseProps {
  as: 'select';
  options: { value: string; label: string }[];
}

type Props = TextProps | TextareaProps | SelectProps;

export default function EditableField(props: Props) {
  const { value, onSave, disabled = false, placeholder, emptyDisplay = '—', ariaLabel, className } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Focus the input the moment we enter edit mode.
  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    if (inputRef.current && 'select' in inputRef.current) {
      inputRef.current.select();
    }
  }, [isEditing]);

  const enterEdit = () => {
    if (disabled || isEditing) return;
    setDraft(value);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(value);
  };

  const commit = async (nextOverride?: string) => {
    const next = nextOverride !== undefined ? nextOverride : draft;
    if (next === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(next);
      setIsEditing(false);
    } catch {
      // Stay in edit mode — parent surfaces the error and the user can retry.
    } finally {
      setIsSaving(false);
    }
  };

  // ===== Display (read) mode =====
  if (!isEditing) {
    const displayLabel =
      props.as === 'select'
        ? props.options.find((o) => o.value === value)?.label ?? value
        : value;
    const isEmpty = !displayLabel;
    const displayChild = props.renderDisplay
      ? props.renderDisplay(value)
      : (displayLabel || emptyDisplay);

    return (
      <button
        type="button"
        onClick={enterEdit}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        className={[
          '-mx-1 cursor-pointer rounded px-1 text-left',
          'hover:bg-zinc-100 dark:hover:bg-white/5',
          disabled ? 'cursor-default hover:bg-transparent dark:hover:bg-transparent' : '',
          isEmpty && !props.renderDisplay ? 'text-zinc-400 italic dark:text-zinc-500' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {displayChild}
      </button>
    );
  }

  // ===== Edit mode =====
  const onTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
  };

  const onTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void commit();
    }
  };

  if (props.as === 'textarea') {
    return (
      <Textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onTextareaKeyDown}
        rows={props.rows ?? 3}
        placeholder={placeholder}
        disabled={isSaving}
        aria-label={ariaLabel}
      />
    );
  }

  if (props.as === 'select') {
    return (
      <Select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        value={draft}
        onChange={(e) => {
          // Commit the new value directly — selects don't have a separate "blur" semantic
          // for users, and waiting for blur after change feels laggy.
          setDraft(e.target.value);
          void commit(e.target.value);
        }}
        onBlur={() => {
          // If the user opens the select and clicks away without picking
          // anything, exit edit mode. commit() is a no-op when draft === value,
          // so this just flips back to display.
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={isSaving}
        aria-label={ariaLabel}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={onTextKeyDown}
      placeholder={placeholder}
      disabled={isSaving}
      aria-label={ariaLabel}
    />
  );
}
