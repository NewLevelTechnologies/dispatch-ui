// Pure helpers for the notification template editor.
//
// Substitution is client-side Mustache: cheap, instant, and stable enough
// that the live preview won't diverge from production rendering for the
// editor's purposes. The send-test path goes through the server-side
// renderer — that's the official rendering for anything that leaves the
// building.

import type { ReactNode, RefObject } from 'react';
import clsx from 'clsx';
import type { NotificationTemplateVariable } from '../api/setup';

const VAR_RE = /\{\{(\w+)\}\}/g;

/**
 * Replace every `{{var}}` token in `text` with the matching value from
 * `sample`. Tokens with no sample value pass through unchanged so the
 * preview's warning style picks them up.
 */
export function resolveBody(
  text: string,
  sample: Record<string, string>
): string {
  return text.replace(VAR_RE, (_, k: string) => sample[k] ?? `{{${k}}}`);
}

/**
 * Walk the source text and emit a flat array of React nodes — plain string
 * runs interleaved with `<span>` wrappers around each `{{var}}` token.
 *
 * Tokens with a sample value render in the accent tint (the variable
 * resolved). Tokens without a sample render in the warning tint so the
 * user can spot unknown / missing variables.
 */
export function renderWithHighlights(
  source: string,
  sample: Record<string, string>
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(source)) !== null) {
    if (m.index > lastIndex) parts.push(source.slice(lastIndex, m.index));
    const name = m[1];
    const v = sample[name];
    parts.push(
      <span
        key={`${name}-${m.index}`}
        title={`{{${name}}}`}
        className={clsx(
          'rounded-[3px] px-[3px] font-medium',
          v !== undefined
            ? 'bg-accent-500/14 text-fg-accent'
            : 'bg-warning-500/18 text-warning-500'
        )}
      >
        {v ?? `{{${name}}}`}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

/**
 * Return the set of `{{var}}` names referenced in `text`. Deduped.
 */
export function extractUsedVariables(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(text)) !== null) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Insert `{{name}}` at the current cursor position of the ref'd input or
 * textarea, restore focus, and put the caret just after the inserted token.
 * Calls `onChange(next)` with the updated string so the caller can put it
 * back in form state.
 */
export function insertAtCursor(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  name: string,
  onChange: (next: string) => void
): void {
  const el = ref.current;
  const token = `{{${name}}}`;
  if (!el) {
    // No element to anchor to — append to the end is the safe default.
    onChange(token);
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = `${before}${token}${after}`;
  onChange(next);

  // Restore focus + caret on the next tick so React has time to flush the
  // controlled-value update before we touch selectionStart/End.
  requestAnimationFrame(() => {
    if (!ref.current) return;
    const pos = start + token.length;
    ref.current.focus();
    try {
      ref.current.setSelectionRange(pos, pos);
    } catch {
      // setSelectionRange throws on inputs of type=email/number etc. —
      // not the case here, but cheap to guard.
    }
  });
}

/**
 * Filter the template's available variables to those valid in a given
 * field. During the BE PR-1 transition, variables without an explicit
 * `scope` are treated as valid everywhere.
 */
export function variablesForScope(
  variables: NotificationTemplateVariable[] | undefined,
  scope: 'SUBJECT' | 'BODY'
): NotificationTemplateVariable[] {
  if (!variables) return [];
  return variables.filter((v) => !v.scope || v.scope.includes(scope));
}

/**
 * Synthesize a one-line summary from the diff between two versions.
 * The BE doesn't track an admin-authored "what changed" string in v1
 * — see `VersionHistoryRail`.
 */
export function summarizeVersionDiff(
  prev: { subject?: string | null; bodyTemplate?: string | null; htmlBodyTemplate?: string | null } | null,
  curr: { subject?: string | null; bodyTemplate?: string | null; htmlBodyTemplate?: string | null }
): string {
  if (!prev) return 'Initial version';
  const subjectChanged = (prev.subject ?? '') !== (curr.subject ?? '');
  const bodyChanged =
    (prev.bodyTemplate ?? '') !== (curr.bodyTemplate ?? '') ||
    (prev.htmlBodyTemplate ?? '') !== (curr.htmlBodyTemplate ?? '');
  if (subjectChanged && bodyChanged) return 'Modified subject + body';
  if (subjectChanged) return 'Modified subject';
  if (bodyChanged) return 'Modified body';
  return 'No content change';
}

/**
 * Accessor with BE PR-1 transition fallback. The new field is `example`;
 * the legacy field is `exampleValue`. Remove once BE PR-1 ships.
 */
export function getVariableExample(v: NotificationTemplateVariable): string {
  return v.example ?? v.exampleValue ?? '';
}
