/* eslint-disable i18next/no-literal-string -- dense visual form; primary copy stays inline. Translation pass lives in a follow-up. */
// SMS channel editor: a single Message card with a segment counter in the
// title-bar action slot. We surface the 160-char threshold but don't
// enforce it — SMS payloads >160 just segment into multiple messages
// downstream.

import { useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Card } from '../catalyst/card';
import { Field } from '../catalyst/fieldset';
import { Textarea } from '../catalyst/textarea';
import { VariableStrip } from './VariableStrip';
import { Callout } from '../ui/Callout';
import {
  insertAtCursor,
  resolveBody,
  variablesForScope,
} from '../../lib/templateEditor';
import type { NotificationTemplateVariable } from '../../api/setup';

export type SmsEditorForm = {
  bodyTemplate: string;
};

type Props = {
  form: SmsEditorForm;
  onChange: (next: SmsEditorForm) => void;
  variables: NotificationTemplateVariable[] | undefined;
  sample: Record<string, string>;
};

const SMS_SEGMENT = 160;

function SmsCounter({
  raw,
  resolved,
}: {
  raw: number;
  resolved: number;
}) {
  const over = resolved > SMS_SEGMENT;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-mono text-[11px] tabular-nums',
        over ? 'text-warning-500' : 'text-fg-muted'
      )}
      aria-label={`Resolved length ${resolved} characters, raw ${raw} characters`}
    >
      <span className="font-semibold">{resolved}</span>
      <span className="text-fg-dim">/ {SMS_SEGMENT}</span>
      <span className="text-fg-dim">· raw {raw}</span>
    </span>
  );
}

export function TemplateEditorSms({
  form,
  onChange,
  variables,
  sample,
}: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyChips = useMemo(
    () => variablesForScope(variables, 'BODY'),
    [variables]
  );

  const resolved = useMemo(
    () => resolveBody(form.bodyTemplate, sample),
    [form.bodyTemplate, sample]
  );

  return (
    <>
      <Card
        title="Message"
        subtitle="Tap a variable chip to insert. SMS providers segment past 160 characters."
        action={<SmsCounter raw={form.bodyTemplate.length} resolved={resolved.length} />}
        className="mb-3"
      >
        <Field size="xs">
          <Textarea
            ref={bodyRef}
            rows={6}
            className="font-mono text-[12px] leading-[1.55]"
            value={form.bodyTemplate}
            onChange={(e) => onChange({ bodyTemplate: e.target.value })}
            aria-label="SMS message"
          />
        </Field>
        <VariableStrip
          hint="Insert variable"
          chips={bodyChips}
          onInsert={(name) =>
            insertAtCursor(bodyRef, name, (next) =>
              onChange({ bodyTemplate: next })
            )
          }
        />
      </Card>

      {/* Line-break guidance. Static, always-on note for now. The better
          future shape is proactive validation: detect when the message
          actually contains a line break (\n) and surface this only then,
          instead of showing it unconditionally — where it's just noise for
          the common single-line case. Wire that in when the editor grows
          real lint rules. */}
      <Callout kind="info" title="Line breaks in SMS">
        Carriers don't always honor them. Single-line messages deliver more
        reliably across iOS, Android, and feature phones.
      </Callout>
    </>
  );
}
