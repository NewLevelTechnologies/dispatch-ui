// Lightweight CodeMirror 6 wrapper for the email template HTML body.
//
// Why a wrapper (not raw CodeMirror inline in the editor): the surrounding
// React form is controlled, so we need a controlled value bridge — keep CM
// stateful internally and only dispatch a `setDoc` on outside-driven value
// changes (template load, reset, version restore) to avoid resetting the
// caret on every keystroke. The variable-strip's "insert at cursor" path
// also needs a way in; expose it as an imperative method via ref.
//
// Mustache `{{var}}` tokens are decorated with the same accent tint as the
// live preview — so the user sees the same affordance in the editor and
// the rendered email side-by-side.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

export type HtmlCodeEditorHandle = {
  /** Splice the given text at the current caret position, restoring focus. */
  insertAtCursor: (text: string) => void;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  /** Lines tall — sets a min-height so the editor doesn't collapse empty. */
  minLines?: number;
};

// ─── Mustache `{{var}}` decoration ────────────────────────────────────
// Highlights every {{var}} in the doc with a tinted span. The accent
// CSS variable is the source of truth — light/dark + warm/cool flip
// without us re-defining the highlight class.
const mustacheTokenDeco = Decoration.mark({ class: 'cm-mustache-token' });
const MUSTACHE_RE = /\{\{(\w+)\}\}/g;

function buildMustacheDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    MUSTACHE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MUSTACHE_RE.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      builder.add(start, end, mustacheTokenDeco);
    }
  }
  return builder.finish();
}

const mustachePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMustacheDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMustacheDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ─── Token-driven theme ────────────────────────────────────────────────
// Mirror our design-token palette so light/dark/warm/cool flow through
// without separate CM theme bundles. Heights stay tight to match the
// surrounding dense form scale.
const baseTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: 'var(--fg)',
  },
  '.cm-scroller': {
    fontFamily:
      "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: '1.55',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-elev-2)',
    color: 'var(--fg-dim)',
    borderRight: '1px solid var(--border-soft)',
  },
  '.cm-activeLineGutter, .cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    caretColor: 'var(--fg-strong)',
    padding: '6px 0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklch, var(--accent-500) 22%, transparent)',
  },
  '.cm-mustache-token': {
    backgroundColor: 'color-mix(in oklch, var(--accent-500) 14%, transparent)',
    color: 'var(--accent-700)',
    borderRadius: '3px',
    padding: '0 3px',
    fontWeight: 500,
  },
});

export const HtmlCodeEditor = forwardRef<HtmlCodeEditorHandle, Props>(
  function HtmlCodeEditor(
    { value, onChange, ariaLabel, minLines = 12 },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    // Keep the latest onChange in a ref so the CM extension list (built
    // once on mount) always reads the current handler without us having
    // to rebuild the editor on every parent render.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const extensions = useMemo(
      () => [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        html(),
        mustachePlugin,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': ariaLabel ?? 'HTML body',
          role: 'textbox',
          'aria-multiline': 'true',
        }),
        baseTheme,
        EditorView.updateListener.of((vu) => {
          if (vu.docChanged) {
            onChangeRef.current(vu.state.doc.toString());
          }
        }),
      ],
      [ariaLabel]
    );

    // Mount the EditorView once. We deliberately don't put `value` in the
    // deps array — outside-driven value changes are reconciled separately
    // below.
    useEffect(() => {
      if (!hostRef.current) return;
      const view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: value,
          extensions,
        }),
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // extensions is memoized on a stable input; value is the initial
      // doc and intentionally not reactive here (see effect below).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [extensions]);

    // Sync external value → editor doc. Only dispatch when they actually
    // differ to avoid resetting the caret/scroll on every parent render.
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          const view = viewRef.current;
          if (!view) return;
          const { from, to } = view.state.selection.main;
          view.focus();
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      }),
      []
    );

    return (
      <div
        ref={hostRef}
        className="overflow-hidden rounded-md border border-border bg-bg-elev focus-within:border-accent-500"
        style={{ minHeight: `${minLines * 19}px` }}
      />
    );
  }
);
