/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@dispatch/utils';
import type { LaborRateType, LineType } from '../../api/setup';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Field, Label } from '../catalyst/fieldset';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { FREEFORM_TYPES, LINE_TYPE_LABEL } from './documentModel';
import type { NewLine } from './DocumentLinesCard';

type Mode = 'labor' | 'freeform';

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const isQty = (n: number | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
const isMoney = (n: number | undefined) => n == null || (Number.isFinite(n) && n >= 0);

/**
 * Where lines are added: labor at a rate type, or a typed-in line. Stays
 * open after adding so several lines go in quickly. Pricebook lines get
 * their own mode when the pricebook lands.
 */
export function AddLinePanel({
  rates,
  onAdd,
  onClose,
}: {
  /** Active labor rate types, in the tenant's order. */
  rates: LaborRateType[];
  onAdd: (line: NewLine) => Promise<boolean>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(rates.length ? 'labor' : 'freeform');
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <ToggleGroup value={mode} onChange={setMode} size="sm" aria-label="Kind of line">
          <ToggleGroupOption value="labor">Labor</ToggleGroupOption>
          <ToggleGroupOption value="freeform">Freeform</ToggleGroupOption>
        </ToggleGroup>
        <span className="text-[11.5px] text-fg-muted">
          {mode === 'labor' ? 'Hours at a labor rate' : 'Typed in, not from the pricebook'}
        </span>
        <span className="flex-1" />
        <Button plain size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
      {mode === 'labor' ? <LaborLineForm rates={rates} onAdd={onAdd} /> : <FreeformLineForm onAdd={onAdd} />}
    </div>
  );
}

function LaborLineForm({ rates, onAdd }: { rates: LaborRateType[]; onAdd: (line: NewLine) => Promise<boolean> }) {
  const [rateId, setRateId] = useState(rates.find((r) => r.role === 'REGULAR')?.id ?? rates[0]?.id ?? '');
  const [hours, setHours] = useState('1');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const rate = rates.find((r) => r.id === rateId);
  const qty = num(hours);
  const typed = num(price);
  const valid = !!rate && isQty(qty) && isMoney(typed);
  // The customer's rate plan may price it differently; the line shows what it billed at.
  const each = typed ?? rate?.billRate ?? null;

  if (!rates.length) {
    return (
      <p className="text-[12px] text-fg-muted">
        No labor rates are active.{' '}
        <Link to="/settings/labor-rates" className="text-fg-accent hover:underline">
          Set up labor rates
        </Link>
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy || !rate || !isQty(qty)) return;
    setBusy(true);
    const ok = await onAdd({
      type: 'LABOR',
      laborRateTypeId: rate.id,
      quantity: qty,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(typed != null ? { unitPrice: typed } : {}),
    });
    setBusy(false);
    if (ok) {
      setDescription('');
      setPrice('');
    }
  };

  return (
    <form onSubmit={submit} aria-label="Add labor line">
      <ToggleGroup value={rateId} onChange={setRateId} size="sm" aria-label="Labor rate" className="flex-wrap">
        {rates.map((r) => (
          <ToggleGroupOption key={r.id} value={r.id}>
            {r.name}
            <span className="ml-1 tabular-nums text-fg-muted">
              {r.billRate != null ? `${formatCurrency(r.billRate)}/hr` : 'not set'}
            </span>
          </ToggleGroupOption>
        ))}
      </ToggleGroup>
      <div className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[80px_minmax(200px,1fr)_110px_auto]">
        <Field>
          <Label className="!text-[11px]">Hours</Label>
          <Input size="xs" autoFocus inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="[&_input]:text-right" />
        </Field>
        <Field className="col-span-2 sm:col-span-1 max-sm:order-first">
          <Label className="!text-[11px]">Description</Label>
          <Input size="xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={rate?.name ?? ''} />
        </Field>
        <Field>
          <Label className="!text-[11px]">Price / hr</Label>
          <Input
            size="xs"
            inputMode="decimal"
            value={price}
            invalid={!isMoney(typed)}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={rate?.billRate != null ? rate.billRate.toFixed(2) : 'Type a price'}
            className="[&_input]:text-right"
          />
        </Field>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <Button type="submit" color="dark/zinc" size="xs" disabled={!valid || busy}>
            Add
          </Button>
          {each != null && isQty(qty) && (
            <span className="whitespace-nowrap text-[11.5px] tabular-nums text-fg-muted">
              {qty} hr × {formatCurrency(each)} ={' '}
              <span className="font-semibold text-fg-strong">{formatCurrency(Math.round(qty * each * 100) / 100)}</span>
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-fg-muted">
        {rate?.billRate == null
          ? 'This rate has no bill rate yet. Type a price, unless the customer’s rate plan sets one.'
          : 'Leave price blank to bill at the rate, or the customer’s plan rate if it has one.'}
      </div>
    </form>
  );
}

function FreeformLineForm({ onAdd }: { onAdd: (line: NewLine) => Promise<boolean> }) {
  const blank = { description: '', type: 'SERVICE' as LineType, quantity: '1', unit: '', unitCost: '', unitPrice: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof blank>) => setF((x) => ({ ...x, ...p }));
  const qty = num(f.quantity);
  const price = num(f.unitPrice);
  const cost = num(f.unitCost);
  const valid = f.description.trim() !== '' && isQty(qty) && price != null && isMoney(price) && isMoney(cost);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy || !isQty(qty) || price == null) return;
    setBusy(true);
    const ok = await onAdd({
      type: f.type,
      description: f.description.trim(),
      quantity: qty,
      unitPrice: price,
      ...(cost != null ? { unitCost: cost } : {}),
      ...(f.unit.trim() ? { unit: f.unit.trim() } : {}),
    });
    setBusy(false);
    if (ok) setF({ ...blank, type: f.type });
  };

  return (
    <form onSubmit={submit} aria-label="Add freeform line">
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(200px,1fr)_130px_70px_70px_96px_96px_auto]">
        <Field className="col-span-2 sm:col-span-1">
          <Label className="!text-[11px]">Description</Label>
          <Input size="xs" autoFocus value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What the customer sees on the line" />
        </Field>
        <Field>
          <Label className="!text-[11px]">Type</Label>
          <Select size="xs" value={f.type} onChange={(e) => set({ type: e.target.value as LineType })}>
            {FREEFORM_TYPES.map((t) => (
              <option key={t} value={t}>{LINE_TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label className="!text-[11px]">Qty</Label>
          <Input size="xs" inputMode="decimal" value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} className="[&_input]:text-right" />
        </Field>
        <Field>
          <Label className="!text-[11px]">Unit</Label>
          <Input size="xs" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="ea" />
        </Field>
        <Field>
          <Label className="!text-[11px]">Unit cost</Label>
          <Input size="xs" inputMode="decimal" value={f.unitCost} onChange={(e) => set({ unitCost: e.target.value })} placeholder="Unknown" className="[&_input]:text-right" />
        </Field>
        <Field>
          <Label className="!text-[11px]">Unit price</Label>
          <Input size="xs" inputMode="decimal" value={f.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} placeholder="0.00" className="[&_input]:text-right" />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Button type="submit" color="dark/zinc" size="xs" disabled={!valid || busy}>
            Add
          </Button>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-fg-muted">Leave cost blank if you don’t know it; margin then shows as unknown, not 100%.</div>
    </form>
  );
}
