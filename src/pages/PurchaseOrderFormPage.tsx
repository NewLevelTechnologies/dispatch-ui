/* eslint-disable i18next/no-literal-string -- dense procurement form; short operational labels stay literal (same convention as CustomerFormPage / UserFormPage). Entity names route through getName(). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, XMarkIcon, BuildingStorefrontIcon, CubeIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import {
  purchaseOrderApi,
  vendorApi,
  workOrderApi,
  type PurchaseOrderLineInput,
  type PurchaseOrderStatus,
  type PurchaseOrderType,
  type Vendor,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { LoadingState } from '../components/ui/LoadingState';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';

// New / Edit purchase order — one type-adaptive full-page form, per the
// designer's screen-po-form.jsx. `?type=order` is the office special order
// (payment terms + ETA, Save draft / Place order); `?type=field` records a
// counter run after the fact (paid-by method, saved RECEIVED). The mock's
// separate mobile-first field-capture screen (tech-at-counter camera hero) is
// future native-mobile-app work — here field purchase is the same desktop form
// with a receipt-upload pre-fill instead of a camera. Cost only — the customer
// price lives on the quote. inventory-mode/stock-location + receiving are
// omitted until the receive endpoint lands (backend-gated).

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n: number) => currency.format(Number.isFinite(n) ? n : 0);

const ORDER_PAYMENT = ['Company account', 'Net 15', 'Net 30', 'Net 60', 'Prepaid'];
const FIELD_PAID_BY = ['Company account', 'Cash', 'Reimbursable', 'Paid at counter'];

interface Row {
  key: string;
  name: string;
  sku: string;
  qty: string;
  unitCost: string;
  billPrice: string;
}
let rowSeq = 0;
const blankRow = (): Row => ({ key: `r-${++rowSeq}`, name: '', sku: '', qty: '1', unitCost: '', billPrice: '' });

export default function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const editing = !!id;

  // Load the PO in edit mode.
  const { data: po, isLoading: poLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchaseOrderApi.getById(id!),
    enabled: editing,
  });

  // Attached work order (from ?workOrderId on create, or the PO in edit) — for
  // the label + back link. Stock POs (no WO) are allowed but not the WO-tab path.
  const workOrderId = editing ? (po?.workOrderId ?? null) : params.get('workOrderId');
  const { data: workOrder } = useQuery({
    queryKey: ['work-order', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId!),
    enabled: !!workOrderId,
  });
  const woNumber = workOrder?.workOrderNumber || (workOrderId ? `#${workOrderId.slice(0, 8)}` : null);
  const backTo = workOrderId ? `/work-orders/${workOrderId}` : '/work-orders';
  const backLabel = woNumber ?? getName('work_order', true);

  // FIELD = counter run (received on save) · ORDER = special order (draft/placed).
  const type: PurchaseOrderType = editing
    ? (po?.type ?? 'ORDER')
    : params.get('type') === 'field'
      ? 'FIELD'
      : params.get('type') === 'stock'
        ? 'STOCK'
        : 'ORDER';
  const field = type === 'FIELD';

  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  // The chosen vendor record (when picked from the list) — drives tax prefill + the meta line.
  const [pickedVendor, setPickedVendor] = useState<Vendor | null>(null);
  const [payment, setPayment] = useState(field ? 'Company account' : 'Net 30');
  const [eta, setEta] = useState('');
  const [notes, setNotes] = useState('');
  const [taxPct, setTaxPct] = useState('');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [scanOff, setScanOff] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Prefill transient form state once the PO loads (same pattern as the *FormPage components).
  useEffect(() => {
    if (!editing || !po) return;
    setVendorName(po.vendorName);
    setVendorId(po.vendorId);
    setPayment(po.paymentMethod ?? (po.type === 'FIELD' ? 'Company account' : 'Net 30'));
    setEta(po.eta ? po.eta.slice(0, 10) : '');
    setNotes(po.notes ?? '');
    setTaxPct(po.taxRate != null ? String(Math.round(po.taxRate * 10000) / 100) : '');
    setRows(
      po.lines.length
        ? po.lines.map((l) => ({
            key: `r-${++rowSeq}`,
            name: l.name,
            sku: l.sku ?? '',
            qty: String(l.quantityOrdered),
            unitCost: String(l.unitCost),
            billPrice: l.billPrice != null ? String(l.billPrice) : '',
          }))
        : [blankRow()],
    );
  }, [editing, po]);

  // Seed the vendor from ?vendorId (e.g. "New PO" launched from a vendor's page).
  const vendorIdParam = params.get('vendorId');
  const { data: seedVendor } = useQuery({
    queryKey: ['vendor', vendorIdParam],
    queryFn: () => vendorApi.getById(vendorIdParam!),
    enabled: !editing && !!vendorIdParam,
  });
  useEffect(() => {
    if (editing || !seedVendor) return;
    setVendorName(seedVendor.name);
    setVendorId(seedVendor.id);
    setPickedVendor(seedVendor);
    if (seedVendor.taxRate != null) setTaxPct(String(Math.round(seedVendor.taxRate * 10000) / 100));
  }, [editing, seedVendor]);

  // Vendor suggestions — pick an existing vendor (avoids typo-dupes) or free-type
  // a name that the backend resolves-or-creates on save.
  const { data: vendorMatches = [] } = useQuery({
    queryKey: ['vendors', vendorName],
    queryFn: () => vendorApi.search(vendorName.trim()),
    enabled: vendorName.trim().length >= 2 && !vendorId,
  });

  const lineRows = rows.filter((r) => r.name.trim());
  const subtotal = useMemo(
    () => lineRows.reduce((s, r) => s + (parseFloat(r.unitCost) || 0) * (parseInt(r.qty, 10) || 0), 0),
    [lineRows],
  );
  const billTotal = useMemo(
    () => lineRows.reduce((s, r) => s + (parseFloat(r.billPrice) || 0) * (parseInt(r.qty, 10) || 0), 0),
    [lineRows],
  );
  const taxRate = taxPct.trim() === '' ? 0 : (parseFloat(taxPct) || 0) / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const margin = billTotal - total;
  const canSave = !!vendorName.trim() && lineRows.length > 0;

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const buildLines = (): PurchaseOrderLineInput[] =>
    lineRows.map((r) => ({
      name: r.name.trim(),
      sku: r.sku.trim() || undefined,
      quantityOrdered: parseInt(r.qty, 10) || 1,
      unitCost: parseFloat(r.unitCost) || 0,
      billPrice: r.billPrice.trim() !== '' ? parseFloat(r.billPrice) || 0 : undefined,
    }));

  const save = useMutation({
    // `status` seeds the create; edit preserves the PO's existing status (unused here).
    mutationFn: (status: PurchaseOrderStatus) => {
      const vendor = vendorId ? { vendorId } : { vendorName: vendorName.trim() };
      const common = {
        ...vendor,
        paymentMethod: payment,
        taxRate,
        eta: field ? null : eta || null,
        notes: notes.trim() || null,
        lines: buildLines(),
      };
      if (editing && id) {
        return purchaseOrderApi.update(id, common);
      }
      return purchaseOrderApi.create({
        workOrderId: workOrderId || null,
        type,
        status,
        ...common,
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (workOrderId) queryClient.invalidateQueries({ queryKey: ['purchase-orders', workOrderId] });
      showSuccess(editing ? 'Purchase order saved' : 'Purchase order created');
      navigate(`/purchase-orders/${saved.id}`);
    },
    onError: (err: unknown) => showError('Could not save the purchase order', extractApiError(err) ?? undefined),
  });

  const scan = useMutation({
    mutationFn: (file: File) => purchaseOrderApi.scanReceipt(file),
    onSuccess: (res) => {
      if (res.vendorName && !vendorName.trim()) {
        setVendorName(res.vendorName);
        setVendorId(null);
      }
      if (res.lines.length) {
        setRows(
          res.lines.map((l) => ({
            key: `r-${++rowSeq}`,
            name: l.name,
            sku: '',
            qty: String(l.quantity || 1),
            unitCost: l.unitCost != null ? String(l.unitCost) : '',
            billPrice: '',
          })),
        );
      }
      showSuccess('Filled from the receipt — review the amounts');
    },
    onError: (err: unknown) => {
      const code =
        err instanceof Error && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      // 403 = AI off / not opted in → hide scan; manual entry is the floor.
      if (code === 403) setScanOff(true);
      else showError('Receipt scan failed — enter the items manually');
    },
  });

  const busy = save.isPending || scan.isPending;

  if (editing && poLoading) {
    return (
      <AppLayout>
        <LoadingState label="Loading purchase order…" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[900px]">
          <Link to={backTo} className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
            ← {backLabel}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {editing ? 'Edit purchase order' : field ? 'Record field purchase' : 'New purchase order'}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1">
              {editing
                ? `${po?.poNumber ?? ''} · ${field ? 'field purchase' : 'special order'}`
                : field
                  ? 'Log a counter run that already happened. Cost only — the customer price lives on the quote.'
                  : 'Order parts or equipment from a vendor. Cost only — the customer price lives on the quote.'}
            </Text>
          </div>

          {/* Receipt scan pre-fill (field, AI-gated). Desktop upload, not a camera. */}
          {field && !editing && !scanOff && (
            <div className="mb-3.5 flex items-center gap-3 rounded-[10px] border border-dashed border-accent-500/40 bg-accent-500/5 px-3.5 py-3">
              <ReceiptPercentIcon className="size-5 shrink-0 text-fg-accent" />
              <div className="min-w-0 grow">
                <div className="text-[12.5px] font-semibold text-fg-strong">Scan a receipt to pre-fill</div>
                <div className="text-[11px] text-fg-muted">Vendor and line items auto-fill from the photo — you confirm the amounts.</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) scan.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button color="accent" size="xs" disabled={busy} onClick={() => fileRef.current?.click()}>
                {scan.isPending ? 'Reading…' : 'Upload receipt'}
              </Button>
            </div>
          )}

          {/* Vendor & terms */}
          <Card title="Vendor" className="mb-3.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <VendorField
                name={vendorName}
                meta={pickedVendor}
                onName={(v) => {
                  setVendorName(v);
                  setVendorId(null);
                  setPickedVendor(null);
                }}
                matches={vendorId ? [] : vendorMatches}
                onPick={(v) => {
                  setVendorName(v.name);
                  setVendorId(v.id);
                  setPickedVendor(v);
                  // Prefill the PO tax from the vendor's default (explicit taxRate still wins on save).
                  if (v.taxRate != null) setTaxPct(String(Math.round(v.taxRate * 10000) / 100));
                }}
              />
              {field ? (
                <Field size="xs">
                  <Label size="xs">Paid by</Label>
                  <ToggleGroup value={payment} onChange={setPayment} aria-label="Paid by">
                    {FIELD_PAID_BY.map((p) => (
                      <ToggleGroupOption key={p} value={p}>
                        {p}
                      </ToggleGroupOption>
                    ))}
                  </ToggleGroup>
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <Field size="xs">
                    <Label size="xs">Payment</Label>
                    <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
                      {ORDER_PAYMENT.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field size="xs">
                    <Label size="xs">Expected · ETA</Label>
                    <Input size="xs" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          {/* Line items */}
          <Card title="Items" subtitle="Cost is what we pay the vendor. Bill price is the suggested sell price on the quote." className="mb-3.5">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-fg-muted">
                    {[
                      ['Item / part', 'text-left'],
                      ['SKU', 'text-left'],
                      ['Qty', 'text-center'],
                      ['Unit cost', 'text-right'],
                      ['Bill price', 'text-right'],
                      ['Line', 'text-right'],
                      ['', 'text-right'],
                    ].map(([h, al], i) => (
                      <th key={i} className={`${al} pb-1.5 text-[10px] font-bold uppercase tracking-[0.06em]`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const line = (parseFloat(r.unitCost) || 0) * (parseInt(r.qty, 10) || 0);
                    return (
                      <tr key={r.key} className="border-t border-border-soft">
                        <td className="py-1 pr-2">
                          <Input size="xs" value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} placeholder="Part name" aria-label="Item name" />
                        </td>
                        <td className="px-1 py-1">
                          <Input size="xs" value={r.sku} onChange={(e) => updateRow(r.key, { sku: e.target.value })} placeholder="—" aria-label="SKU" className="!w-24 [&_input]:font-mono" />
                        </td>
                        <td className="px-1 py-1">
                          <Input size="xs" type="number" min={0} value={r.qty} onChange={(e) => updateRow(r.key, { qty: e.target.value })} aria-label="Quantity" className="!w-14 [&_input]:text-center" />
                        </td>
                        <td className="px-1 py-1">
                          <Input size="xs" type="number" min={0} step="0.01" value={r.unitCost} onChange={(e) => updateRow(r.key, { unitCost: e.target.value })} placeholder="0.00" aria-label="Unit cost" className="!w-24 [&_input]:text-right" />
                        </td>
                        <td className="px-1 py-1">
                          <Input size="xs" type="number" min={0} step="0.01" value={r.billPrice} onChange={(e) => updateRow(r.key, { billPrice: e.target.value })} placeholder="—" aria-label="Bill price" className="!w-24 [&_input]:text-right" />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right font-mono font-semibold tabular-nums text-fg-strong">{money(line)}</td>
                        <td className="py-1 pl-1 text-right">
                          <Button plain size="xs" onClick={() => removeRow(r.key)} disabled={rows.length === 1} aria-label="Remove item">
                            <XMarkIcon className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button plain size="xs" className="mt-2" onClick={addRow}>
              <PlusIcon data-slot="icon" />
              Add item
            </Button>
          </Card>

          {/* Attach + notes */}
          <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Card title={`For ${getName('work_order').toLowerCase()}`}>
              {workOrderId ? (
                <Link to={`/work-orders/${workOrderId}`} className="flex items-center gap-2 text-[12.5px]">
                  <CubeIcon className="size-4 text-fg-muted" />
                  <span className="font-mono font-semibold text-fg-accent">{woNumber}</span>
                  {workOrder?.serviceLocation?.locationName && (
                    <span className="text-fg-muted">{workOrder.serviceLocation.locationName}</span>
                  )}
                </Link>
              ) : (
                <Text size="sm" tone="muted">
                  Not attached — recorded as stock.
                </Text>
              )}
              <Text size="xs" tone="muted" className="mt-2">
                Cost lands on this {getName('work_order').toLowerCase()}. Received parts clear the trip blocker once the receive step ships.
              </Text>
            </Card>
            <Card title="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the receiver or vendor should know…" />
            </Card>
          </div>

          {/* Cost summary */}
          <div className="mb-3.5 ml-auto max-w-[320px] rounded-[10px] border border-border bg-bg-elev p-3.5">
            <div className="flex items-center justify-between py-0.5 text-[12px]">
              <span className="text-fg-muted">Subtotal</span>
              <span className="font-mono tabular-nums text-fg">{money(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-fg-muted">
                Tax
                <Input
                  size="xs"
                  type="number"
                  min={0}
                  step="0.01"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  placeholder="0"
                  aria-label="Tax rate percent"
                  className="!w-14 [&_input]:text-right"
                />
                %
              </span>
              <span className="font-mono tabular-nums text-fg">{money(tax)}</span>
            </div>
            <div className="my-2 h-px bg-border-soft" />
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-fg-strong">Total cost</span>
              <span className="font-mono text-[17px] font-bold tabular-nums text-fg-strong">{money(total)}</span>
            </div>
            {billTotal > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-fg-muted">Margin if billed</span>
                <span className="font-mono font-bold tabular-nums text-success-600">{money(margin)}</span>
              </div>
            )}
          </div>

          {/* Footer — release decision */}
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted max-sm:basis-full">
              {field ? <ReceiptPercentIcon className="size-3.5" /> : <BuildingStorefrontIcon className="size-3.5" />}
              {lineRows.length} {lineRows.length === 1 ? 'item' : 'items'} · {money(total)} cost
            </div>
            <span className="flex-1" />
            <Button href={backTo} plain size="xs">
              {t('common.cancel')}
            </Button>
            {editing ? (
              <Button color="accent" size="xs" disabled={!canSave || busy} onClick={() => canSave && save.mutate(po?.status ?? 'DRAFT')}>
                {save.isPending ? t('common.saving') : 'Save changes'}
              </Button>
            ) : field ? (
              <Button color="accent" size="xs" disabled={!canSave || busy} onClick={() => canSave && save.mutate('RECEIVED')}>
                {save.isPending ? t('common.saving') : 'Save purchase'}
              </Button>
            ) : (
              <>
                <Button outline size="xs" disabled={!canSave || busy} onClick={() => canSave && save.mutate('DRAFT')}>
                  Save draft
                </Button>
                <Button color="accent" size="xs" disabled={!canSave || busy} onClick={() => canSave && save.mutate('ORDERED')}>
                  {save.isPending ? t('common.saving') : 'Place order'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Vendor autocomplete — Catalyst Input + a suggestion dropdown from
// vendorApi.search. Picking sets vendorId; free-typing clears it (the backend
// resolves-or-creates by name on save).
function VendorField({
  name,
  meta,
  onName,
  matches,
  onPick,
}: {
  name: string;
  meta: Vendor | null;
  onName: (v: string) => void;
  matches: Vendor[];
  onPick: (v: Vendor) => void;
}) {
  const [open, setOpen] = useState(false);
  // Inherited account/terms/ordering/rep from the chosen vendor (snapshotted onto the PO server-side).
  const metaBits = meta
    ? [meta.accountNumber && `Acct ${meta.accountNumber}`, meta.paymentTerms, meta.orderingMethod, meta.rep].filter(Boolean)
    : [];
  return (
    <Field size="xs" className="relative">
      <Label size="xs" required>
        Vendor
      </Label>
      <Input
        size="xs"
        value={name}
        onChange={(e) => {
          onName(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Grainger, Home Depot…"
        aria-label="Vendor"
      />
      {metaBits.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
          {meta?.preferred && (
            <span className="rounded-sm bg-success-500/12 px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide text-success-600">
              Preferred
            </span>
          )}
          <span className="truncate">{metaBits.join(' · ')}</span>
        </div>
      )}
      {open && matches.length > 0 && name.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-bg-elev shadow-lg">
          {matches.slice(0, 6).map((v) => (
            <button
              key={v.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(v);
                setOpen(false);
              }}
              className="block w-full border-b border-border-soft px-2.5 py-1.5 text-left text-[12.5px] text-fg-strong last:border-b-0 hover:bg-bg-hover"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
