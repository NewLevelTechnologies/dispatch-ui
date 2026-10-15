/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Textarea } from '../catalyst/textarea';
import { Field, FieldGroup, Label, Description } from '../catalyst/fieldset';
import { useGlossary } from '../../contexts/GlossaryContext';

export interface HeaderDateField {
  key: string;
  label: string;
  /** YYYY-MM-DD, or '' when unset. */
  value: string;
  required?: boolean;
  hint?: string;
}

export interface HeaderValues {
  /** Only when the dialog edits a title (quotes). */
  workTitle?: string | null;
  dates: Record<string, string>;
  customerPoNumber: string | null;
  notes: string | null;
}

/**
 * Edits a quote's or invoice's header. The server replaces the whole header,
 * so the caller sends every field back — the dialog returns them all.
 */
export function DocumentHeaderDialog({
  open,
  onClose,
  title,
  description,
  workTitle,
  dates,
  customerPoNumber,
  notes,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** A quote's short description of the work. Leave undefined for documents without one. */
  workTitle?: string | null;
  dates: HeaderDateField[];
  customerPoNumber: string | null | undefined;
  notes: string | null | undefined;
  onSave: (values: HeaderValues) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="xl">
      {/* Remount on each open so the form starts from the saved header. */}
      {open && (
        <HeaderForm
          title={title}
          description={description}
          workTitle={workTitle}
          dates={dates}
          customerPoNumber={customerPoNumber}
          notes={notes}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function HeaderForm({
  title,
  description,
  workTitle,
  dates,
  customerPoNumber,
  notes,
  onSave,
  onClose,
}: {
  title: string;
  description?: string;
  workTitle?: string | null;
  dates: HeaderDateField[];
  customerPoNumber: string | null | undefined;
  notes: string | null | undefined;
  onSave: (values: HeaderValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const { getName } = useGlossary();
  const hasTitle = workTitle !== undefined;
  const [heading, setHeading] = useState(workTitle ?? '');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(dates.map((d) => [d.key, d.value])),
  );
  const [po, setPo] = useState(customerPoNumber ?? '');
  const [text, setText] = useState(notes ?? '');
  const [busy, setBusy] = useState(false);
  const valid = dates.every((d) => !d.required || values[d.key]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave({
      ...(hasTitle ? { workTitle: heading.trim() || null } : {}),
      dates: values,
      customerPoNumber: po.trim() || null,
      notes: text.trim() || null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription>{description}</DialogDescription>}
      <DialogBody>
        <FieldGroup>
          {hasTitle && (
            <Field>
              <Label>Title</Label>
              <Input
                value={heading}
                maxLength={120}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="e.g. Condenser replacement · 3-ton"
              />
              <Description>{`A short description of the work. The ${getName('customer').toLowerCase()} sees it on the ${getName('quote').toLowerCase()}.`}</Description>
            </Field>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {dates.map((d) => (
              <Field key={d.key}>
                <Label>{d.label}</Label>
                <Input
                  type="date"
                  value={values[d.key]}
                  required={d.required}
                  onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                />
                {d.hint && <Description>{d.hint}</Description>}
              </Field>
            ))}
          </div>
          <Field className="sm:max-w-[240px]">
            <Label>{`${getName('customer')} PO #`}</Label>
            <Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="None" className="[&_input]:font-mono" />
          </Field>
          <Field>
            <Label>Notes</Label>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!valid || busy}>
          Save
        </Button>
      </DialogActions>
    </form>
  );
}
