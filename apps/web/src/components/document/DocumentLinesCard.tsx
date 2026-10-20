/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import { laborRatesApi, type AddLineRequest, type DocumentAdjustment, type DocumentLineItem, type LaborRateType } from '../../api/setup';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { DragHandle } from '../settings/DragHandle';
import { AddLinePanel, type AddLineTab } from './AddLinePanel';
import { DocumentAdjustDialog, type AdjustTarget, type NewAdjustment } from './DocumentAdjustDialog';
import { DenseTable, DenseTHead, DenseRow } from '../ui/DenseTable';
import { Tag } from '../ui/Pill';
import {
  LINE_TYPE_LABEL,
  LINE_TYPE_TONE,
  TAX_CLASS_LABEL,
  adjustmentChip,
  documentAdjustmentBase,
  lineAdjustmentBase,
  documentShare,
  isHandPriced,
  isLegacy,
  lineAdjustments,
  lineMargin,
  lineProvenance,
  moveLine,
  pct,
  sortLines,
  unitPriceNote,
  type PricedDocument,
} from './documentModel';

type LineChange = Partial<Pick<DocumentLineItem, 'description' | 'quantity' | 'unitPrice' | 'laborRateTypeId'>>;
export type NewLine = Omit<AddLineRequest, 'version'>;

/** What an editable document can do to its lines. Each resolves true once saved. */
export interface LineEditing {
  onUpdate: (line: DocumentLineItem, change: LineChange) => Promise<boolean>;
  onRemove: (line: DocumentLineItem) => Promise<boolean>;
  onReorder: (lineIds: string[]) => Promise<boolean>;
  onAdd: (line: NewLine) => Promise<boolean>;
  onAddAdjustment: (adjustment: NewAdjustment) => Promise<boolean>;
  onRemoveAdjustment: (adjustment: DocumentAdjustment) => Promise<boolean>;
}

/**
 * The document's lines: one component for quotes and invoices, read-only
 * unless `editing` is passed. Pricing context — rate plan and tax — sits in
 * the card head because it explains the numbers below it.
 */
export function DocumentLinesCard({
  doc,
  showCost,
  onShowCostChange,
  editing,
}: {
  doc: PricedDocument;
  showCost: boolean;
  onShowCostChange: (show: boolean) => void;
  editing?: LineEditing;
}) {
  const legacy = isLegacy(doc);
  const lines = sortLines(doc.lineItems);
  const costCols = !legacy && showCost;
  // `?add=` opens the add-line panel on arrival: `pricebook` for a draft just
  // created (the next keystroke searches), `po` from the job's "Not billed
  // yet" card (the job's purchase-order parts).
  const [params] = useSearchParams();
  const addParam = params.get('add');
  const initialTab: AddLineTab = addParam === 'po' ? 'po' : 'pricebook';
  const [adding, setAdding] = useState(!!editing && (addParam === 'po' || addParam === 'pricebook'));
  const docPoLineIds = new Set(doc.lineItems.map((l) => l.sourcePoLineId).filter((id): id is string => !!id));
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const { data: rates = [] } = useQuery({
    queryKey: ['labor-rates'],
    queryFn: () => laborRatesApi.getAll(),
    enabled: !!editing,
  });
  const activeRates = rates.filter((r) => r.active);
  // Read from the latest document, so a removal shows at once.
  const adjustingLine = adjusting && 'line' in adjusting ? lines.find((l) => l.id === adjusting.line.id) : null;
  const targetAdjustments = adjusting
    ? (doc.adjustments ?? []).filter((a) => (adjustingLine ? a.lineId === adjustingLine.id : a.lineId == null))
    : [];

  const drop = (targetId: string) => {
    if (!editing || !drag) return;
    const ids = lines.map((l) => l.id);
    const next = moveLine(ids, drag.id, targetId);
    setDrag(null);
    if (next !== ids) void editing.onReorder(next);
  };

  return (
    <Card
      padding="none"
      title={
        <span className="flex flex-wrap items-center gap-2">
          Lines <span className="text-[11px] font-normal text-fg-muted">{lines.length}</span>
          {!legacy && <PricingContext doc={doc} />}
        </span>
      }
      action={
        !legacy && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fg">
            <input
              type="checkbox"
              checked={showCost}
              onChange={(e) => onShowCostChange(e.target.checked)}
              className="accent-[var(--accent-600)]"
            />
            Cost &amp; margin <Tag word>Internal</Tag>
          </label>
        )
      }
    >
      <div className="overflow-x-auto">
        <DenseTable className={legacy ? undefined : costCols ? 'min-w-[1040px]' : 'min-w-[880px]'}>
          <DenseTHead>
            <tr>
              <th>Item</th>
              <th className="right">Qty</th>
              <th className="right">Unit price</th>
              {!legacy && <th>Adjustments</th>}
              {!legacy && <th>Tax</th>}
              <th className="right">Amount</th>
              {costCols && <th className="right">Cost</th>}
              {costCols && <th className="right">Margin</th>}
              {editing && <th aria-label="Line actions" />}
            </tr>
          </DenseTHead>
          <tbody>
            {lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                doc={doc}
                legacy={legacy}
                showCost={costCols}
                editing={editing}
                rates={activeRates}
                onAdjust={() => setAdjusting({ line })}
                drag={
                  editing && lines.length > 1
                    ? {
                        dragging: drag?.id === line.id,
                        over: drag != null && drag.over === line.id && drag.id !== line.id,
                        onStart: () => setDrag({ id: line.id, over: null }),
                        onOver: () => setDrag((d) => (d && d.over !== line.id ? { ...d, over: line.id } : d)),
                        onDrop: () => drop(line.id),
                        onEnd: () => setDrag(null),
                      }
                    : undefined
                }
              />
            ))}
            {!lines.length && (
              <tr>
                <td colSpan={9} className="py-7 text-center text-[12.5px] text-fg-muted">
                  {editing ? 'No lines yet. Add from the pricebook, labor, or a freeform line.' : 'No lines yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </div>
      {editing && adding && <AddLinePanel
          rates={activeRates}
          billToCustomerId={doc.customerId}
          workOrderId={doc.workOrderId}
          ratePlanId={doc.ratePlanId}
          docPoLineIds={docPoLineIds}
          initialTab={initialTab}
          onAdd={editing.onAdd}
          onClose={() => setAdding(false)}
        />}
      {editing && (
        <div className="flex flex-wrap gap-1.5 border-t border-border-soft px-3.5 py-2.5">
          <Button
            {...(adding ? { color: 'dark/zinc' as const } : { outline: true as const })}
            size="xs"
            aria-pressed={adding}
            onClick={() => setAdding((a) => !a)}
          >
            + Add line
          </Button>
          {lines.length > 0 && (
            <Button plain size="xs" onClick={() => setAdjusting({ document: true })}>
              {(doc.adjustments ?? []).some((a) => a.lineId == null) ? 'Document discounts' : 'Document discount'}
            </Button>
          )}
        </div>
      )}
      {editing && (
        <DocumentAdjustDialog
          target={adjusting && 'line' in adjusting ? (adjustingLine ? { line: adjustingLine } : null) : adjusting}
          base={
            adjusting && 'line' in adjusting
              ? adjustingLine
                ? lineAdjustmentBase(adjustingLine, doc.adjustments)
                : null
              : adjusting
                ? documentAdjustmentBase(lines, doc.adjustments)
                : null
          }
          existing={targetAdjustments}
          onAdd={editing.onAddAdjustment}
          onRemove={editing.onRemoveAdjustment}
          onClose={() => setAdjusting(null)}
        />
      )}
    </Card>
  );
}

/**
 * A table-cell input that saves on blur or Enter, only when the value
 * changed, and snaps back if the save fails or the value is invalid.
 */
function CommitInput({
  value,
  numeric,
  label,
  className,
  onCommit,
}: {
  value: string | number;
  numeric?: boolean;
  label: string;
  className?: string;
  onCommit: (next: string | number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  const commit = async () => {
    const raw = draft.trim();
    let next: string | number = raw;
    if (numeric) {
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < 0) return setDraft(String(value));
      next = n;
    } else if (!raw) {
      return setDraft(String(value));
    }
    if (next === value) return;
    if (!(await onCommit(next))) setDraft(String(value));
  };
  return (
    <Input
      size="xs"
      aria-label={label}
      value={draft}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(String(value));
      }}
      className={className}
    />
  );
}

function PricingContext({ doc }: { doc: PricedDocument }) {
  const tax = doc.tax;
  const taxValue = tax?.exempt
    ? 'Exempt'
    : tax?.jurisdictionName
      ? `${tax.jurisdictionName}${tax.jurisdictionRate != null ? ` · ${pct(tax.jurisdictionRate)}` : ' · no rate'}`
      : 'Not set';
  const chips: [string, string][] = [
    ...(doc.ratePlanName ? ([['Rate plan', doc.ratePlanName]] as [string, string][]) : []),
    ['Tax', taxValue],
  ];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {chips.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-border bg-bg px-2 py-0.5 text-[11.5px] font-normal"
        >
          <span className="text-fg-muted">{k}</span>
          <span className="font-semibold text-fg-strong">{v}</span>
        </span>
      ))}
    </span>
  );
}

interface RowDrag {
  dragging: boolean;
  over: boolean;
  onStart: () => void;
  onOver: () => void;
  onDrop: () => void;
  onEnd: () => void;
}

function LineRow({
  line,
  doc,
  legacy,
  showCost,
  editing,
  rates,
  onAdjust,
  drag,
}: {
  line: DocumentLineItem;
  doc: PricedDocument;
  legacy: boolean;
  showCost: boolean;
  editing?: LineEditing;
  /** Active labor rate types, for switching a labor line's rate. */
  rates: LaborRateType[];
  onAdjust: () => void;
  drag?: RowDrag;
}) {
  const own = lineAdjustments(line.id, doc.adjustments);
  const share = documentShare(line, doc.adjustments);
  const net = line.netAmount ?? line.lineTotal;
  const discounted = !legacy && net < line.lineTotal;
  const note = legacy ? null : unitPriceNote(line);
  const margin = lineMargin(line);
  const lineCost = line.unitCost != null ? line.unitCost * line.quantity : null;

  const handPriced = !!editing && isHandPriced(line);
  // Draggable only while the handle is held, so the row's inputs keep normal
  // text selection.
  const [armed, setArmed] = useState(false);

  return (
    <DenseRow
      draggable={!!drag && armed}
      onDragStart={(e) => {
        if (!drag) return;
        e.dataTransfer.effectAllowed = 'move';
        drag.onStart();
      }}
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        drag.onOver();
      }}
      onDrop={(e) => {
        if (!drag) return;
        e.preventDefault();
        drag.onDrop();
      }}
      onDragEnd={() => {
        setArmed(false);
        drag?.onEnd();
      }}
      className={clsx(
        drag?.dragging && 'opacity-50',
        drag?.over && 'outline outline-2 -outline-offset-2 outline-accent-500/40',
      )}
    >
      <td>
        <div className="flex items-start gap-1.5">
          {drag && (
            <span
              className="mt-1 hidden sm:flex"
              onMouseDown={() => setArmed(true)}
              onMouseUp={() => setArmed(false)}
            >
              <DragHandle ariaLabel="Drag to reorder line" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {line.type && (
              <div className={clsx('text-[10px] font-bold uppercase tracking-[0.04em]', LINE_TYPE_TONE[line.type])}>
                {LINE_TYPE_LABEL[line.type]}
              </div>
            )}
            {handPriced ? (
              <CommitInput
                label="Description"
                value={line.description}
                onCommit={(v) => editing!.onUpdate(line, { description: String(v) })}
              />
            ) : (
              <div className="text-[12.5px] font-medium text-fg-strong">{line.description}</div>
            )}
            {editing && line.laborRateTypeId ? (
              <LaborRatePicker line={line} rates={rates} onChange={(id) => editing.onUpdate(line, { laborRateTypeId: id })} />
            ) : (
              !legacy && <Provenance line={line} />
            )}
          </div>
        </div>
      </td>
      <td className="right num" data-label="Qty">
        {editing ? (
          <CommitInput
            label="Quantity"
            numeric
            value={line.quantity}
            className="ml-auto !w-16 [&_input]:text-right"
            onCommit={(v) => editing.onUpdate(line, { quantity: Number(v) })}
          />
        ) : (
          line.quantity
        )}
        {line.unit && <div className="text-[10.5px] text-fg-muted">{line.unit}</div>}
      </td>
      <td className="right num" data-label="Unit price">
        {handPriced ? (
          <CommitInput
            label="Unit price"
            numeric
            value={line.unitPrice}
            className="ml-auto !w-24 [&_input]:text-right"
            onCommit={(v) => editing!.onUpdate(line, { unitPrice: Number(v) })}
          />
        ) : (
          formatCurrency(line.unitPrice)
        )}
        {note && <div className="text-[10.5px] leading-tight text-fg-muted">{note}</div>}
      </td>
      {!legacy && (
        <td data-label="Adjustments">
          <div className="flex flex-col items-start gap-1">
            {own.map((a) => (
              <span
                key={a.id}
                className="whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold text-success-500"
                style={{ background: 'color-mix(in oklch, var(--success-500) 12%, transparent)' }}
              >
                {adjustmentChip(a)}
              </span>
            ))}
            {share > 0 && <span className="text-[11px] tabular-nums text-fg-muted">Doc discount −{formatCurrency(share)}</span>}
            {!own.length && share <= 0 && <span className="text-fg-dim">—</span>}
          </div>
        </td>
      )}
      {!legacy && (
        <td data-label="Tax">
          <div className="text-[12px] text-fg">{line.taxClass ? TAX_CLASS_LABEL[line.taxClass] : '—'}</div>
          <div className="text-[10.5px] tabular-nums text-fg-muted">
            {line.taxable && line.taxRate != null
              ? `${pct(line.taxRate)} · ${formatCurrency(line.taxAmount ?? 0)}`
              : 'Not taxed'}
          </div>
        </td>
      )}
      <td className="right num" data-label="Amount">
        {discounted && <div className="text-[11px] text-fg-muted line-through">{formatCurrency(line.lineTotal)}</div>}
        <div className="text-[13px] font-semibold text-fg-strong">{formatCurrency(net)}</div>
      </td>
      {showCost && (
        <td className={clsx('right num', lineCost == null && 'text-fg-muted')} data-label="Cost">
          {lineCost == null ? 'Unknown' : formatCurrency(lineCost)}
        </td>
      )}
      {showCost && (
        <td className="right num" data-label="Margin">
          {margin == null ? <span className="text-fg-dim">—</span> : `${margin}%`}
        </td>
      )}
      {editing && (
        <td className="right">
          <div className="flex items-center justify-end gap-0.5">
            <Button plain size="xs" aria-label={`Adjust ${line.description}`} onClick={onAdjust}>
              Adjust
            </Button>
            <Button plain size="xs" aria-label={`Remove ${line.description}`} onClick={() => void editing.onRemove(line)}>
              <XMarkIcon />
            </Button>
          </div>
        </td>
      )}
    </DenseRow>
  );
}

function Provenance({ line }: { line: DocumentLineItem }) {
  const p = lineProvenance(line);
  const text =
    p.kind === 'pricebook' ? (
      <span className="font-mono">{p.sku ?? 'Pricebook item'}</span>
    ) : p.kind === 'labor' ? (
      `Labor · ${p.rateName ?? 'rate type'}`
    ) : p.kind === 'po' ? (
      'From a purchase order'
    ) : (
      'Freeform · not in pricebook'
    );
  return <div className="mt-px text-[11px] text-fg-muted">{text}</div>;
}

/** A labor line's rate type, switchable in place; the server reprices it at the new rate. */
function LaborRatePicker({
  line,
  rates,
  onChange,
}: {
  line: DocumentLineItem;
  rates: LaborRateType[];
  onChange: (rateTypeId: string) => Promise<boolean>;
}) {
  // The line keeps a rate type that has since been deactivated.
  const current = rates.some((r) => r.id === line.laborRateTypeId)
    ? null
    : { id: line.laborRateTypeId!, name: line.laborRateTypeName ?? 'Current rate' };
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
      Labor ·
      <Select
        size="xs"
        aria-label={`Labor rate for ${line.description}`}
        value={line.laborRateTypeId ?? ''}
        onChange={(e) => void onChange(e.target.value)}
        className="!w-auto"
      >
        {current && <option value={current.id}>{current.name}</option>}
        {rates.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
