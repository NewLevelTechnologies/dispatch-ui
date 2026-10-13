/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import { pricebookApi, purchaseBillingApi, ratePlansApi, type LaborRateType, type LineType, type PricebookItem, type UnbilledPurchase } from '../../api/setup';
import { Button } from '../catalyst/button';
import { Input, InputGroup } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Field, Label } from '../catalyst/fieldset';
import { Checkbox } from '../catalyst/checkbox';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { ViewTabs } from '../ui/Tabs';
import { FREEFORM_TYPES, LINE_TYPE_LABEL, LINE_TYPE_TONE, pricingRuleNote } from './documentModel';
import type { NewLine } from './DocumentLinesCard';

export type AddLineTab = 'pricebook' | 'labor' | 'freeform' | 'po';
type Tab = AddLineTab;
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
  billToCustomerId,
  workOrderId,
  ratePlanId,
  docPoLineIds,
  initialTab = 'pricebook',
  onAdd,
  onClose,
}: {
  /** Active labor rate types, in the tenant's order. */
  rates: LaborRateType[];
  /** The document's customer: search results are priced at its rate plan, so what's picked is what lands. */
  billToCustomerId?: string;
  /** The job, for parts bought on its purchase orders. */
  workOrderId?: string | null;
  ratePlanId?: string | null;
  /** PO lines already on this document; they aren't offered again. */
  docPoLineIds: Set<string>;
  initialTab?: AddLineTab;
  onAdd: (line: NewLine) => Promise<boolean>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: unbilled = [] } = useQuery({
    queryKey: ['unbilledPurchases', workOrderId],
    queryFn: () => purchaseBillingApi.getUnbilled(workOrderId!),
    enabled: !!workOrderId,
  });
  // A quote's lines don't count as billed, so parts already on this document are left out here too.
  const poLines = unbilled.filter((p) => !docPoLineIds.has(p.poLineId));
  const [freeformSeed, setFreeformSeed] = useState('');
  const [flash, setFlash] = useState<{ name: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flashAdded = (name: string) => {
    setFlash({ name, at: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1800);
  };
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
            ...(workOrderId && (poLines.length || tab === 'po')
              ? [{ id: 'po', label: poLines.length ? `From PO (${poLines.length})` : 'From PO' }]
              : []),
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
            billToCustomerId={billToCustomerId}
            onAdd={add}
            onFreeform={(q) => {
              setFreeformSeed(q);
              setTab('freeform');
            }}
          />
        ) : tab === 'po' ? (
          <FromPoForm lines={poLines} ratePlanId={ratePlanId} workOrderId={workOrderId!} onAdd={onAdd} onAdded={(n) => flashAdded(n)} />
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
function PricebookSearch({
  billToCustomerId,
  onAdd,
  onFreeform,
}: {
  billToCustomerId?: string;
  onAdd: Add;
  onFreeform: (q: string) => void;
}) {
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['pricebook-items', 'search', q, billToCustomerId],
    queryFn: () => pricebookApi.getItems({ q, active: true, size: 20, billToCustomerId }),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  });
  // With nothing typed, the items this tenant adds most are one click away.
  const { data: frequent = [] } = useQuery({
    queryKey: ['pricebook-items', 'frequent', billToCustomerId],
    queryFn: () => pricebookApi.getFrequent({ size: 6, billToCustomerId }),
  });
  const results = q ? (data?.content ?? []) : frequent;
  const highlighted = Math.min(hi, Math.max(0, results.length - 1));

  const pick = async (item: PricebookItem) => {
    if (busy || priceOf(item) == null) return;
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
      {!q && !results.length ? (
        <p className="mt-2 text-[11.5px] text-fg-muted">Type a name or SKU. ↑↓ to move, Enter adds and clears for the next item.</p>
      ) : q && results.length === 0 && !isFetching ? (
        <p className="mt-2 text-[12px] text-fg-muted">
          No items match “{q}”.{' '}
          <button type="button" className="!font-semibold text-fg-accent hover:underline" onClick={() => onFreeform(q)}>
            Add it as a freeform line
          </button>
        </p>
      ) : (
        <>
          <div className="mt-2 px-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {!q ? 'Frequently used' : results.length === 1 ? '1 result' : `${results.length} results`}
          </div>
          <ul id="pricebook-results" role="listbox" aria-label="Pricebook results" className="mt-1 max-h-[264px] overflow-y-auto">
            {results.map((item, i) => {
              const price = priceOf(item);
              const unpriced = price == null;
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
                  <span className="text-[10.5px] text-fg-muted">{resultNote(item, !!billToCustomerId)}</span>
                  <span className="min-w-[80px] text-right text-[12.5px] font-medium tabular-nums text-fg-strong">
                    {price == null ? '—' : formatCurrency(price)}
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

/** What a line added from the item would bill at: the account's plan price when asked for it, else the list price. */
const priceOf = (item: PricebookItem) => (item.planUnitPrice !== undefined ? item.planUnitPrice : item.unitPrice);

/** How the shown price was made: the plan rule, or the list price as-is. */
function resultNote(item: PricebookItem, forAccount: boolean) {
  if (priceOf(item) == null) return 'needs Regular rate';
  if (item.pricingRule) {
    const rule = pricingRuleNote(item.pricingRule, item.pricingRuleValue);
    return item.unitPrice != null && item.unitPrice !== item.planUnitPrice ? `list ${formatCurrency(item.unitPrice)} · ${rule}` : rule;
  }
  // Without the account, the price is the list price and a plan may still change it on the line.
  return forAccount ? null : 'list';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parts bought on the job's purchase orders and not billed yet, all checked
 * to start. Each line keeps a link to its PO line, so the part stops showing
 * as unbilled. Price prefills from the PO's bill price; left blank, the
 * customer's rate plan prices it from cost, which needs markup tiers.
 */
function FromPoForm({
  lines,
  ratePlanId,
  workOrderId,
  onAdd,
  onAdded,
}: {
  lines: UnbilledPurchase[];
  ratePlanId?: string | null;
  workOrderId: string;
  onAdd: (line: NewLine) => Promise<boolean>;
  onAdded: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: plan } = useQuery({
    queryKey: ['rate-plans', 'one', ratePlanId],
    queryFn: () => ratePlansApi.get(ratePlanId!),
    enabled: !!ratePlanId,
  });
  const fromCost = (plan?.markupTiers.length ?? 0) > 0;
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.poLineId,
        { on: true, qty: String(l.unbilledQuantity), price: l.suggestedUnitPrice != null ? String(l.suggestedUnitPrice) : '' },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  // Parts that arrived after the tab opened start checked too.
  const row = (l: UnbilledPurchase) =>
    rows[l.poLineId] ?? {
      on: true,
      qty: String(l.unbilledQuantity),
      price: l.suggestedUnitPrice != null ? String(l.suggestedUnitPrice) : '',
    };
  const set = (l: UnbilledPurchase, patch: Partial<{ on: boolean; qty: string; price: string }>) =>
    setRows((rs) => ({ ...rs, [l.poLineId]: { ...row(l), ...patch } }));

  if (!lines.length) {
    return <p className="py-3 text-center text-[12.5px] text-fg-muted">All parts bought for this job are already billed or on this document.</p>;
  }
  const picked = lines.filter((l) => row(l).on);
  const rowOk = (l: UnbilledPurchase) => {
    const r = row(l);
    const qty = num(r.qty);
    const price = num(r.price);
    return isQty(qty) && isMoney(price) && (price != null || fromCost);
  };
  const ready = picked.length > 0 && picked.every(rowOk);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    let added = 0;
    for (const l of picked) {
      const r = row(l);
      const price = num(r.price);
      const ok = await onAdd({
        type: 'MATERIAL',
        description: l.description,
        quantity: num(r.qty)!,
        unitCost: l.unitCost,
        sourcePoLineId: l.poLineId,
        ...(price != null ? { unitPrice: price } : {}),
      });
      if (!ok) break;
      added++;
    }
    setBusy(false);
    queryClient.invalidateQueries({ queryKey: ['unbilledPurchases', workOrderId] });
    if (added) onAdded(added === 1 ? picked[0].description : `${added} lines`);
  };

  return (
    <form onSubmit={submit} aria-label="Add from purchase orders">
      <p className="mb-1.5 text-[11.5px] text-fg-muted">Parts bought on purchase orders for this job. Each line keeps a link to its PO line.</p>
      <ul className="divide-y divide-border-soft">
        {lines.map((l) => {
          const r = row(l);
          return (
            <li key={l.poLineId} className="flex flex-wrap items-center gap-2.5 py-1.5">
              <Checkbox aria-label={`Add ${l.description}`} checked={r.on} onChange={(on) => set(l, { on })} />
              <span className="flex min-w-[200px] flex-1 flex-col">
                <span className="text-[12.5px] text-fg-strong">{l.description}</span>
                <span className="text-[11px] tabular-nums text-fg-muted">
                  <span className="font-mono">{l.purchaseOrderNumber}</span>
                  {l.sku && <span className="font-mono"> · {l.sku}</span>}
                  {' · '}
                  {l.billedQuantity > 0 ? `${l.unbilledQuantity} of ${l.quantity} not billed` : `qty ${l.quantity}`} · cost {formatCurrency(l.unitCost)}
                </span>
              </span>
              <Input
                size="xs"
                inputMode="decimal"
                aria-label={`Quantity of ${l.description}`}
                value={r.qty}
                disabled={!r.on}
                onChange={(e) => set(l, { qty: e.target.value })}
                className="!w-16 [&_input]:text-right"
              />
              <Input
                size="xs"
                inputMode="decimal"
                aria-label={`Price of ${l.description}`}
                value={r.price}
                disabled={!r.on}
                invalid={r.on && !rowOk(l)}
                placeholder={fromCost ? 'From cost' : 'Price'}
                onChange={(e) => set(l, { price: e.target.value })}
                className="!w-24 [&_input]:text-right"
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex-1 text-[11px] text-fg-muted">
          {fromCost
            ? `Leave price blank to price from cost by ${plan?.name ?? 'the rate plan'}’s markup tiers.`
            : 'Enter a price for each part. This customer’s rate plan has no markup tiers to price from cost.'}
        </span>
        <span className="text-[11.5px] tabular-nums text-fg-muted">
          cost {formatCurrency(r2(picked.reduce((s, l) => s + (num(row(l).qty) ?? 0) * l.unitCost, 0)))}
        </span>
        <Button type="submit" color="dark/zinc" size="xs" disabled={!ready || busy}>
          {picked.length === 1 ? 'Add 1 line' : `Add ${picked.length} lines`}
        </Button>
      </div>
    </form>
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
