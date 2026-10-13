/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import { formatCurrency } from '@dispatch/utils';
import type { AddAdjustmentRequest, AdjustmentKind, DocumentAdjustment, DocumentLineItem } from '../../api/setup';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Description, Field, Fieldset, Label, Legend } from '../catalyst/fieldset';
import { Radio, RadioField, RadioGroup } from '../catalyst/radio';
import { REASON_LABEL, adjustmentChip } from './documentModel';

export type NewAdjustment = Omit<AddAdjustmentRequest, 'version'>;
type ManualReason = NewAdjustment['reasonCode'];

const REASONS: ManualReason[] = ['GOODWILL', 'REPAIR_APPROVED', 'PROMOTION', 'INCENTIVE', 'DISCRETIONARY', 'OTHER'];

/** What's being adjusted: one line, or the whole document (spread over the lines before tax). */
export type AdjustTarget = { line: DocumentLineItem } | { document: true };

/**
 * Discounts and waives on a line or the whole document: the ones already
 * there (each removable) and a form to add another. The server works out
 * the amounts; nothing here is priced in the browser.
 */
export function DocumentAdjustDialog({
  target,
  existing,
  onAdd,
  onRemove,
  onClose,
}: {
  target: AdjustTarget | null;
  existing: DocumentAdjustment[];
  onAdd: (adjustment: NewAdjustment) => Promise<boolean>;
  onRemove: (adjustment: DocumentAdjustment) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Dialog open={target != null} onClose={onClose} size="lg">
      {target && <AdjustForm target={target} existing={existing} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />}
    </Dialog>
  );
}

function AdjustForm({
  target,
  existing,
  onAdd,
  onRemove,
  onClose,
}: {
  target: AdjustTarget;
  existing: DocumentAdjustment[];
  onAdd: (adjustment: NewAdjustment) => Promise<boolean>;
  onRemove: (adjustment: DocumentAdjustment) => Promise<boolean>;
  onClose: () => void;
}) {
  const line = 'line' in target ? target.line : null;
  const [kind, setKind] = useState<AdjustmentKind>(line?.feeRole === 'TRIP' ? 'WAIVE' : 'PERCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState<ManualReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const n = Number(value);
  const valueOk = kind === 'WAIVE' || (value.trim() !== '' && Number.isFinite(n) && n > 0 && (kind === 'AMOUNT' || n <= 100));
  const ready = valueOk && reason !== '' && note.length <= 500;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const ok = await onAdd({
      ...(line ? { lineId: line.id } : {}),
      kind,
      ...(kind === 'PERCENT' ? { value: Math.round(n * 100) / 10000 } : kind === 'AMOUNT' ? { value: n } : {}),
      reasonCode: reason as ManualReason,
      ...(note.trim() ? { reasonNote: note.trim() } : {}),
    });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async (a: DocumentAdjustment) => {
    setBusy(true);
    await onRemove(a);
    setBusy(false);
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{line ? `Adjust ${line.description}` : 'Document discount'}</DialogTitle>
      <DialogDescription>
        {line
          ? `List ${formatCurrency(line.lineTotal)}. The customer sees the list price struck through, with the saving and its reason.`
          : 'Spread over the lines before tax, in proportion to each, so tax stays right when labor and materials are taxed differently.'}
      </DialogDescription>
      <DialogBody>
        {existing.length > 0 && (
          <ul className="mb-4 divide-y divide-border-soft rounded-md border border-border-soft">
            {existing.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="text-fg-strong">{adjustmentChip(a)}</span>
                  {a.reasonNote && <span className="block text-[11px] text-fg-muted">{a.reasonNote}</span>}
                  {a.sourceType === 'AGREEMENT' && (
                    <span className="block text-[11px] text-fg-muted">From the membership. Removing it doesn't add it back.</span>
                  )}
                </span>
                <span className="tabular-nums font-semibold text-success-500">−{formatCurrency(a.computedAmount)}</span>
                <Button plain size="xs" disabled={busy} onClick={() => void remove(a)} aria-label={`Remove ${adjustmentChip(a)}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Fieldset>
          <Legend className="!text-[13px]">{existing.length ? 'Add another' : 'Add'}</Legend>
          <RadioGroup value={kind} onChange={(v) => setKind(v as AdjustmentKind)} className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <RadioField>
              <Radio value="PERCENT" />
              <Label>% off</Label>
            </RadioField>
            <RadioField>
              <Radio value="AMOUNT" />
              <Label>$ off</Label>
            </RadioField>
            {line && (
              <RadioField>
                <Radio value="WAIVE" />
                <Label>Waive</Label>
              </RadioField>
            )}
          </RadioGroup>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
            {kind !== 'WAIVE' && (
              <Field>
                <Label>{kind === 'PERCENT' ? 'Percent' : 'Amount'}</Label>
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={kind === 'PERCENT' ? '10' : '25.00'}
                  invalid={value.trim() !== '' && !valueOk}
                  className="[&_input]:text-right"
                />
              </Field>
            )}
            <Field className={kind === 'WAIVE' ? 'sm:col-span-2' : undefined}>
              <Label>Reason</Label>
              <Select value={reason} onChange={(e) => setReason(e.target.value as ManualReason)}>
                <option value="">Choose a reason…</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field className="mt-3">
            <Label>Note</Label>
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            <Description>For the office. The customer sees only the reason.</Description>
          </Field>
        </Fieldset>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          Done
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || busy}>
          Apply
        </Button>
      </DialogActions>
    </form>
  );
}
