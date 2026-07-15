/* eslint-disable i18next/no-literal-string -- dense procurement detail; short operational labels stay literal (same convention as the other detail pages). Entity names route through getName(). */
import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CubeIcon,
  ReceiptPercentIcon,
  PencilSquareIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  purchaseOrderApi,
  poFilesApi,
  PO_FILE_CONTENT_TYPES,
  PO_FILE_MAX_BYTES,
  type PurchaseOrderStatus,
  type PurchaseOrderResponse,
  type PoFileResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Pill, Tag } from '../components/ui/Pill';
import { LoadingState } from '../components/ui/LoadingState';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED'];
const STATUS_TONE: Record<PurchaseOrderStatus, PillTone> = {
  DRAFT: 'neutral',
  ORDERED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'violet',
};
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  BILLED: 'Billed',
};
const TYPE_LABEL = { FIELD: 'Field purchase', ORDER: 'Special order', STOCK: 'Stock' } as const;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n?: number | null) => currency.format(n ?? 0);
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const { data: po, isLoading, isError } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchaseOrderApi.getById(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: PurchaseOrderStatus) => purchaseOrderApi.update(id!, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['purchase-order', id], updated);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err: unknown) => showError('Could not change the status', err instanceof Error ? err.message : undefined),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingState label="Loading purchase order…" />
      </AppLayout>
    );
  }
  if (isError || !po) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1080px] py-10 text-center">
          <Text className="!text-sm !text-rose-600 dark:!text-rose-400">Couldn't load this purchase order.</Text>
          <Button plain size="xs" className="mt-3" onClick={() => navigate('/work-orders')}>
            ← {getName('work_order', true)}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const field = po.type === 'FIELD';
  const backTo = po.workOrderId ? `/work-orders/${po.workOrderId}` : '/work-orders';
  const billTotal = po.lines.reduce((s, l) => s + (l.billPrice ?? 0) * l.quantityOrdered, 0);
  const margin = billTotal - (po.totalCost ?? 0);
  const marginPct = billTotal > 0 ? Math.round((margin / billTotal) * 100) : 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1080px] px-1 py-1">
        <Link to={backTo} className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
          ← {po.workOrderId ? getName('work_order') : getName('work_order', true)}
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3.5 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm">
          <span
            className="grid size-[46px] shrink-0 place-items-center rounded-[10px]"
            style={{
              background: field
                ? 'color-mix(in oklch, var(--info-500) 14%, var(--bg-elev))'
                : 'color-mix(in oklch, var(--accent-500) 14%, var(--bg-elev))',
              color: field ? 'var(--info-500)' : 'var(--accent-700)',
            }}
          >
            {field ? <ReceiptPercentIcon className="size-6" /> : <CubeIcon className="size-6" />}
          </span>
          <div className="min-w-[220px] grow">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={1} size="page-sm" className="m-0">
                {po.vendorName}
              </Heading>
              <Tag>{TYPE_LABEL[po.type]}</Tag>
              <Pill tone={STATUS_TONE[po.status]} dot>
                {STATUS_LABEL[po.status]}
              </Pill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-muted">
              <span className="font-mono">{po.poNumber}</span>
              <span aria-hidden>·</span>
              <span>{fmtDate(po.createdAt)}</span>
              {po.eta && (
                <>
                  <span aria-hidden>·</span>
                  <span>ETA {fmtDate(po.eta)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="label-tiny">Total cost</span>
            <span className="font-mono text-[22px] font-bold tabular-nums tracking-tight text-fg-strong">{money(po.totalCost)}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Receiving isn't built yet — a plain status set is the honest control. */}
            <label className="flex items-center gap-1.5 text-[11px] text-fg-muted">
              Status
              <Select
                value={po.status}
                onChange={(e) => statusMutation.mutate(e.target.value as PurchaseOrderStatus)}
                disabled={statusMutation.isPending}
                aria-label="Status"
                className="!w-auto"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </label>
            <Button href={`/purchase-orders/${po.id}/edit`} outline size="xs">
              <PencilSquareIcon data-slot="icon" />
              Edit
            </Button>
          </div>
        </div>

        <POStepper type={po.type} status={po.status} />

        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-3">
            {/* Vendor & details */}
            <Card title="Vendor & details">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <KV label="Vendor" value={po.vendorName} />
                <KV label="Ordered" value={fmtDate(po.createdAt)} />
                <KV label="Payment" value={po.paymentMethod || '—'} />
                <KV label={field ? 'Picked up' : 'Expected'} value={po.eta ? fmtDate(po.eta) : field ? 'In hand' : '—'} />
              </div>
            </Card>

            {/* Items */}
            <Card title="Items">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-fg-muted">
                      <th className="border-b border-border-soft pb-1.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Item</th>
                      <th className="border-b border-border-soft pb-1.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Qty</th>
                      <th className="border-b border-border-soft pb-1.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Received</th>
                      <th className="border-b border-border-soft pb-1.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Unit cost</th>
                      <th className="border-b border-border-soft pb-1.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Line cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border-soft">
                        <td className="py-2">
                          <div className="font-medium text-fg-strong">{l.name}</div>
                          {l.sku && <div className="font-mono text-[10.5px] text-fg-dim">{l.sku}</div>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{l.quantityOrdered}</td>
                        <td className="py-2 text-right tabular-nums text-fg-muted">
                          {l.quantityReceived >= l.quantityOrdered && l.quantityOrdered > 0 ? (
                            <Pill tone="success" dot>
                              {l.quantityReceived}
                            </Pill>
                          ) : (
                            l.quantityReceived || '—'
                          )}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">{money(l.unitCost)}</td>
                        <td className="py-2 text-right font-mono font-semibold tabular-nums text-fg-strong">{money(l.lineCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {po.notes && (
                <div className="mt-2.5 border-t border-border-soft pt-2.5 text-[11.5px] leading-relaxed text-fg-muted">{po.notes}</div>
              )}
            </Card>

            <ReceiptCard poId={po.id} files={po.files ?? []} />
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-3">
            {po.workOrderId && (
              <Card title={`For ${getName('work_order').toLowerCase()}`}>
                <Link to={`/work-orders/${po.workOrderId}`} className="text-[12.5px] font-semibold text-fg-accent">
                  Open {getName('work_order').toLowerCase()} →
                </Link>
              </Card>
            )}
            <Card title="Cost" subtitle="what we pay the vendor">
              <div className="flex items-center justify-between py-0.5 text-[12px]">
                <span className="text-fg-muted">Subtotal</span>
                <span className="font-mono tabular-nums text-fg">{money(po.subtotalCost)}</span>
              </div>
              <div className="flex items-center justify-between py-0.5 text-[12px]">
                <span className="text-fg-muted">Tax</span>
                <span className="font-mono tabular-nums text-fg">{money(po.taxAmount)}</span>
              </div>
              <div className="my-2 h-px bg-border-soft" />
              <div className="flex items-baseline justify-between">
                <span className="label-tiny">Total cost</span>
                <span className="font-mono text-[18px] font-bold tabular-nums text-fg-strong">{money(po.totalCost)}</span>
              </div>
              {billTotal > 0 && (
                <div className="mt-2.5 rounded-sm border border-border-soft bg-bg-elev-2 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-fg-muted">Bills to customer</span>
                    <span className="font-mono font-semibold tabular-nums text-fg-strong">{money(billTotal)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11.5px]">
                    <span className="text-fg-muted">Margin on parts</span>
                    <span className="font-mono font-bold tabular-nums text-success-600">
                      {money(margin)} · {marginPct}%
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Receipt / documents attached to the PO. Presigned upload → the PO detail
// refetches (getById carries `files`). Scan pre-fills the form; this stores the
// image — separate steps in v1 (per FE_HANDOFF_po_receipt_photo.md).
function ReceiptCard({ poId, files }: { poId: string; files: PoFileResponse[] }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] });

  const upload = useMutation({
    mutationFn: (file: File) => poFilesApi.upload(poId, file),
    onSuccess: refresh,
    onError: (err: unknown) => showError('Upload failed', err instanceof Error ? err.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => poFilesApi.delete(poId, fileId),
    onSuccess: refresh,
    onError: (err: unknown) => showError('Could not remove the file', err instanceof Error ? err.message : undefined),
  });

  const pick = (file?: File) => {
    if (!file) return;
    if (!(PO_FILE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      showError('Unsupported file type', 'Attach a JPG, PNG, WebP, or PDF.');
      return;
    }
    if (file.size > PO_FILE_MAX_BYTES) {
      showError('File is too large', 'Receipts must be under 25 MB.');
      return;
    }
    upload.mutate(file);
  };

  return (
    <Card
      title="Receipt"
      action={
        <>
          <input
            ref={fileRef}
            type="file"
            accept={PO_FILE_CONTENT_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button plain size="xs" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <ArrowUpTrayIcon data-slot="icon" />
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </>
      }
    >
      {files.length === 0 ? (
        <Text size="sm" tone="muted">
          No receipt attached. Upload the photo or PDF from the counter run.
        </Text>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {files.map((f) => {
            const isImage = f.contentType.startsWith('image/');
            return (
              <div key={f.id} className="group relative">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-md border border-border bg-bg-elev-2"
                  title={f.fileName}
                >
                  {isImage ? (
                    <img src={f.url} alt={f.fileName} className="size-[72px] object-cover" />
                  ) : (
                    <span className="flex size-[72px] flex-col items-center justify-center gap-1 text-fg-muted">
                      <DocumentIcon className="size-6" />
                      <span className="max-w-[64px] truncate px-1 text-[9px]">{f.fileName}</span>
                    </span>
                  )}
                </a>
                <button
                  type="button"
                  onClick={() => remove.mutate(f.id)}
                  disabled={remove.isPending}
                  aria-label="Remove file"
                  className="absolute -right-1.5 -top-1.5 hidden rounded-full border border-border bg-bg-elev p-0.5 text-fg-muted shadow-sm hover:text-danger-600 group-hover:block"
                >
                  <TrashIcon className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="label-tiny mb-0.5">{label}</span>
      <span className="text-[12.5px] font-medium text-fg-strong">{value}</span>
    </div>
  );
}

// Read-only progress — derived from status (the receive action that advances it
// automatically is backend-deferred).
function POStepper({ type, status }: { type: PurchaseOrderResponse['type']; status: PurchaseOrderStatus }) {
  const steps = type === 'FIELD' ? ['Purchased', 'Received', 'Billed'] : ['Draft', 'Ordered', 'Received', 'Billed'];
  const reached =
    type === 'FIELD'
      ? status === 'BILLED'
        ? 2
        : status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED'
          ? 1
          : 0
      : status === 'BILLED'
        ? 3
        : status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED'
          ? 2
          : status === 'ORDERED'
            ? 1
            : 0;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-sm border border-border-soft bg-bg-elev px-3.5 py-2.5">
      {steps.map((s, i) => {
        const done = i < reached;
        const here = i === reached;
        return (
          <div key={s} className="flex flex-shrink-0 items-center gap-2">
            {i > 0 && <span className={`h-0.5 w-4 sm:w-8 ${i <= reached ? 'bg-success-500' : 'bg-border'}`} />}
            <span
              className="grid size-4 place-items-center rounded-full text-[9px] font-bold text-white"
              style={{
                background: done ? 'var(--success-500)' : here ? 'var(--accent-500)' : 'var(--bg-active)',
                color: done || here ? 'white' : 'var(--fg-dim)',
              }}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-[11.5px] ${here ? 'font-bold text-fg-strong' : 'font-medium text-fg-muted'}`}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}
