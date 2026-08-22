/* eslint-disable i18next/no-literal-string -- dense visual form; primary copy stays inline. Translation pass lives in a follow-up. */
// Email channel editor: Subject card + Body card with Plain/HTML toggle.
// Variable strip lives under each editor field so the chips stay close
// to the cursor they'll insert into.
//
// Plain-text tab uses a textarea (it's plain text — no syntax to surface).
// HTML tab uses a CodeMirror wrapper so the source gets syntax highlighting,
// bracket matching, and inline {{var}} chip decoration that matches the
// preview pane.

import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Card } from '../catalyst/card';
import { Field } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Textarea } from '../catalyst/textarea';
import { Text } from '../catalyst/text';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { VariableStrip } from './VariableStrip';
import type { HtmlCodeEditorHandle } from './HtmlCodeEditor';
import { insertAtCursor, variablesForScope } from '../../lib/templateEditor';
import type { NotificationTemplateVariable } from '../../api/setup';

// CodeMirror + the HTML language pack are sizable (~400 KB pre-gzip).
// They only matter when the user actually opens the HTML body tab, so
// keep them in a separate chunk and Suspend on first reveal.
const HtmlCodeEditor = lazy(() =>
  import('./HtmlCodeEditor').then((m) => ({ default: m.HtmlCodeEditor }))
);

export type EmailEditorForm = {
  subject: string;
  bodyTemplate: string;
  htmlBodyTemplate: string;
};

type Props = {
  form: EmailEditorForm;
  onChange: (next: EmailEditorForm) => void;
  variables: NotificationTemplateVariable[] | undefined;
};

type BodyTab = 'plain' | 'html';

export function TemplateEditorEmail({ form, onChange, variables }: Props) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const plainBodyRef = useRef<HTMLTextAreaElement>(null);
  const htmlEditorRef = useRef<HtmlCodeEditorHandle>(null);
  const [bodyTab, setBodyTab] = useState<BodyTab>('plain');

  const subjectChips = useMemo(
    () => variablesForScope(variables, 'SUBJECT'),
    [variables]
  );
  const bodyChips = useMemo(
    () => variablesForScope(variables, 'BODY'),
    [variables]
  );

  const update = (patch: Partial<EmailEditorForm>) => {
    onChange({ ...form, ...patch });
  };

  const insertIntoBody = (name: string) => {
    if (bodyTab === 'html') {
      htmlEditorRef.current?.insertAtCursor(`{{${name}}}`);
      return;
    }
    insertAtCursor(plainBodyRef, name, (next) =>
      update({ bodyTemplate: next })
    );
  };

  return (
    <>
      <Card
        title="Subject"
        subtitle="Required. Shows in the recipient's inbox list."
        className="mb-3"
      >
        <Field size="xs">
          <Input
            size="xs"
            value={form.subject}
            onChange={(e) => update({ subject: e.target.value })}
            ref={subjectRef}
            aria-label="Subject"
          />
        </Field>
        <VariableStrip
          hint="Insert variable"
          chips={subjectChips}
          onInsert={(name) =>
            insertAtCursor(subjectRef, name, (next) =>
              update({ subject: next })
            )
          }
        />
      </Card>

      <Card
        title="Body"
        subtitle="Plain-text fallback below. Add an HTML version if you want richer formatting."
        action={
          <ToggleGroup
            value={bodyTab}
            onChange={setBodyTab}
            aria-label="Body format"
          >
            <ToggleGroupOption value="plain">Plain text</ToggleGroupOption>
            <ToggleGroupOption value="html">HTML</ToggleGroupOption>
          </ToggleGroup>
        }
        className="mb-3"
      >
        {bodyTab === 'plain' ? (
          <Field size="xs">
            <Textarea
              ref={plainBodyRef}
              rows={12}
              className="font-mono text-[12px] leading-[1.55]"
              value={form.bodyTemplate}
              onChange={(e) => update({ bodyTemplate: e.target.value })}
              aria-label="Plain-text body"
            />
          </Field>
        ) : (
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center rounded-md border border-border bg-bg-elev"
                style={{ minHeight: '266px' }}
              >
                <Text size="sm" tone="muted">
                  Loading editor…
                </Text>
              </div>
            }
          >
            <HtmlCodeEditor
              ref={htmlEditorRef}
              value={form.htmlBodyTemplate}
              onChange={(next) => update({ htmlBodyTemplate: next })}
              ariaLabel="HTML body"
              minLines={14}
            />
          </Suspense>
        )}
        <VariableStrip
          hint="Insert variable"
          chips={bodyChips}
          onInsert={insertIntoBody}
        />
      </Card>
    </>
  );
}
