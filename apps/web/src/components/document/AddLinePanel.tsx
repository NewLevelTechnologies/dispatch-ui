/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import { pricebookApi, type LaborRateType, type LineType, type PricebookItem } from '../../api/setup';
import { Button } from '../catalyst/button';
import { Input, InputGroup } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Field, Label } from '../catalyst/fieldset';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { ViewTabs } from '../ui/Tabs';
import { FREEFORM_TYPES, LINE_TYPE_LABEL, LINE_TYPE_TONE } from './documentModel';
import type { NewLine } from './DocumentLinesCard';

type Tab = 'pricebook' | 'labor' | 'freeform';
/** Adds a line and resolves true once saved; `name` is what the "Added …" flash says. */
type Add = (line: NewLine, name: string) => Promise<boolean>;

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const isQty = (n: number | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
const isMoney = (n: number | undefined) => n == null || (Number.isFinite(n) && n >= 0);

/**
 * Where lines are added, docked inside the lines card: from the pricebook
 * (the default, used most), labor at a rate type, or a typed-in line. It
 * stays open after each add, with an "Added …" flash; Done or Esc closes it.
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
  const [tab, setTab] = useState<Tab>('pricebook');
  const [freeformSeed, setFreeformSeed] = useState('');
  const [flash, setFlash] = useState<{ name: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const add: Add = async (line, name) => {
    const ok = await onAdd(line);
    if (ok) {
      setFlash({ name, at: Date.now() });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), 1800);
    }
    return ok;
  };

  return (
    <div
      className="border-t border-border-soft bg-bg-elev-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-end gap-2 pl-1.5 pr-2.5">
        <ViewTabs
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          className="flex-1 !border-b-0"
          tabs={[
            { id: 'pricebook', label: 'Pricebook' },
            { id: 'labor', label: 'Labor' },
            { id: 'freeform', label: 'Freeform' },
          ]}
        />
        {flash && (
          <span key={flash.at} role="status" className="mb-2 max-w-[260px] truncate text-[12px] font-semibold text-success-500">
            Added {flash.name}
          </span>
        )}
        <Button outline size="xs" className="mb-1.5" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="border-t border-border-soft px-3.5 py-2.5">
        {tab === 'pricebook' ? (
          <PricebookSearch
            onAdd={add}
            onFreeform={(q) => {
              setFreeformSeed(q);
              setTab('freeform');
            }}
          />
        ) : tab === 'labor' ? (
          <LaborLineForm rates={rates} onAdd={add} />
        ) : (
          <FreeformLineForm key={freeformSeed} seed={freeformSeed} onAdd={add} />
        )}
      </div>
    </div>
  );
}

/**
 * Search the active pricebook. Arrow keys move the highlight; Enter adds
 * the highlighted item and clears the search for the next one.
 */
function PricebookSearch({ onAdd, onFreeform }: { onAdd: Add; onFreeform: (q: string) => void }) {
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['pricebook-items', 'search', q],
    queryFn: () => pricebookApi.getItems({ q, active: true, size: 20 }),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  });
  const results = q ? (data?.content ?? []) : [];
  const highlighted = Math.min(hi, Math.max(0, results.length - 1));

  const pick = async (item: PricebookItem) => {
    if (busy || item.unitPrice == null) return;
    setBusy(true);
    const ok = await onAdd({ itemId: item.id, quantity: 1 }, item.name);
    setBusy(false);
    if (ok) {
      setSearch('');
      setHi(0);
    }
  };

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi(Math.min(results.length - 1, highlighted + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(Math.max(0, highlighted - 1));
    } else if (e.key === 'Enter' && results[highlighted]) {
      e.preventDefault();
      void pick(results[highlighted]);
    }
  };

  return (
    <div>
      <InputGroup>
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          autoFocus
          size="xs"
          aria-label="Search pricebook"
          placeholder="Search pricebook by name or SKU"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHi(0);
          }}
          onKeyDown={key}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="pricebook-results"
          aria-activedescendant={results[highlighted] ? `pricebook-result-${results[highlighted].id}` : undefined}
        />
      </InputGroup>
      {!q ? (
        <p className="mt-2 text-[11.5px] text-fg-muted">Type a name or SKU. ↑↓ to move, Enter adds and clears for the next item.</p>
      ) : results.length === 0 && !isFetching ? (
        <p className="mt-2 text-[12px] text-fg-muted">
          No items match “{q}”.{' '}
          <button type="button" className="!font-semibold text-fg-accent hover:underline" onClick={() => onFreeform(q)}>
            Add it as a freeform line
          </button>
        </p>
      ) : (
        <>
          <div className="mt-2 px-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {results.length === 1 ? '1 result' : `${results.length} results`}
          </div>
          <ul id="pricebook-results" role="listbox" aria-label="Pricebook results" className="mt-1 max-h-[264px] overflow-y-auto">
            {results.map((item, i) => {
              const unpriced = item.unitPrice == null;
              return (
                <li
                  key={item.id}
                  id={`pricebook-result-${item.id}`}
                  role="option"
                  aria-selected={i === highlighted}
                  aria-disabled={unpriced || undefined}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(item)}
                  className={clsx(
                    'flex items-center gap-3 rounded-sm px-2 py-1.5',
                    unpriced ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                    i === highlighted && 'bg-bg-hover',
                  )}
                >
                  <span className={clsx('w-[66px] shrink-0 text-[10px] font-bold uppercase tracking-[0.04em]', LINE_TYPE_TONE[item.itemType])}>
                    {LINE_TYPE_LABEL[item.itemType]}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] text-fg-strong">{item.name}</span>
                    {item.sku && <span className="font-mono text-[10.5px] text-fg-muted">{item.sku}</span>}
                  </span>
                  <span className="text-[10.5px] text-fg-muted">
                    {unpriced ? 'needs Regular rate' : item.pricingMode === 'COMPUTED' ? 'computed · list' : 'list'}
                  </span>
                  <span className="min-w-[80px] text-right text-[12.5px] font-medium tabular-nums text-fg-strong">
                    {unpriced ? '—' : formatCurrency(item.unitPrice!)}
                    {!unpriced && <span className="text-[10.5px] font-normal text-fg-muted">/{item.unit}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function LaborLineForm({ rates, onAdd }: { rates: LaborRateType[]; onAdd: Add }) {
  // A rate with no bill rate can't be picked: the server would refuse the line.
  const priced = rates.filter((r) => r.billRate != null);
  const [rateId, setRateId] = useState(priced.find((r) => r.role === 'REGULAR')?.id ?? priced[0]?.id ?? '');
  const [hours, setHours] = useState('1');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const rate = priced.find((r) => r.id === rateId);
  const qty = num(hours);
  const typed = num(price);
  const valid = !!rate && isQty(qty) && isMoney(typed);
  // The customer's rate plan may price it differently; the line shows what it billed at.
  const each = typed ?? rate?.billRate ?? null;

  if (!priced.length) {
    return (
      <p className="text-[12px] text-fg-muted">
        {rates.length ? 'No labor rate has a bill rate yet.' : 'No labor rates are active.'}{' '}
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
    const ok = await onAdd(
      {
        type: 'LABOR',
        laborRateTypeId: rate.id,
        quantity: qty,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(typed != null ? { unitPrice: typed } : {}),
      },
      description.trim() || rate.name,
    );
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
          <ToggleGroupOption key={r.id} value={r.id} disabled={r.billRate == null} title={r.billRate == null ? 'No bill rate yet' : undefined}>
            {r.name}
            <span className="ml-1 tabular-nums text-fg-muted">
              {r.billRate != null ? `${formatCurrency(r.billRate)}/hr` : 'Not set'}
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
            placeholder={rate?.billRate?.toFixed(2) ?? ''}
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
      <div className="mt-1 text-[11px] text-fg-muted">Leave price blank to bill at the rate, or the customer’s plan rate if it has one.</div>
    </form>
  );
}

function FreeformLineForm({ seed, onAdd }: { seed: string; onAdd: Add }) {
  const blank = { description: '', type: 'SERVICE' as LineType, quantity: '1', unit: '', unitCost: '', unitPrice: '' };
  const [f, setF] = useState({ ...blank, description: seed });
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
    const ok = await onAdd(
      {
        type: f.type,
        description: f.description.trim(),
        quantity: qty,
        unitPrice: price,
        ...(cost != null ? { unitCost: cost } : {}),
        ...(f.unit.trim() ? { unit: f.unit.trim() } : {}),
      },
      f.description.trim(),
    );
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
