/* eslint-disable i18next/no-literal-string -- dense operational tab; short procurement labels stay literal (same convention as WorkOrderFilesTab). Entity names route through getName(). */
// Work Order "Purchasing" tab — the WO's purchase orders, per the designer's
// tab mock (screen-wo-detail-tabs.jsx §PurchasingTab). A row list (icon + PO# +
// vendor + type tag + meta + status pill + cost + Open→) with two entry points:
// "Record field purchase" (counter run) and "New PO" (office order). A row opens
// the PO in the form drawer (view/edit). Backend contract:
// FE_HANDOFF_wo_purchasing_tab.md — cost-only, status is a free PATCH, no
// receive/stock/delete/approvals.
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CubeIcon, PlusIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import { purchaseOrderApi, type PurchaseOrderListItem } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Pill, Tag } from './ui/Pill';
import { PoTypeBadge } from './ui/PoTypeBadge';
import { PO_STATUS_LABEL, PO_STATUS_TONE, poStatusHasDot } from '../lib/poStatus';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { LoadingState } from './ui/LoadingState';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

interface Props {
  workOrderId: string;
  readOnly?: boolean;
}

export default function WorkOrderPurchasingTab({ workOrderId, readOnly = false }: Props) {
  const { getName } = useGlossary();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-orders', workOrderId],
    queryFn: () => purchaseOrderApi.list({ workOrderId, size: 100 }),
    enabled: !!workOrderId,
  });
  const orders = data?.content ?? [];

  if (isLoading) return <LoadingState label={`Loading purchase orders…`} />;
  if (isError) {
    return (
      <div className="py-8 text-center">
        <Text className="!text-sm !text-rose-600 dark:!text-rose-400">Couldn't load purchase orders.</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border-soft bg-bg-elev">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <span className="flex items-center gap-1.5 label-tiny text-fg">
            <CubeIcon className="size-3.5" /> Purchase orders
            {orders.length > 0 && <Tag>{orders.length}</Tag>}
          </span>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button outline size="xs" href={`/purchase-orders/new?type=field&workOrderId=${workOrderId}`}>
                <ReceiptPercentIcon data-slot="icon" />
                Record field purchase
              </Button>
              <Button color="accent" size="xs" href={`/purchase-orders/new?type=order&workOrderId=${workOrderId}`}>
                <PlusIcon data-slot="icon" />
                New PO
              </Button>
            </div>
          )}
        </div>

        {/* Rows */}
        {orders.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Text className="!text-sm !text-fg-muted">
              No purchase orders on this {getName('work_order').toLowerCase()} yet.
            </Text>
          </div>
        ) : (
          <div>
            {orders.map((po) => (
              <PORow key={po.id} po={po} />
            ))}
          </div>
        )}
      </div>

      {/* Cost↔price explainer (mock footer) */}
      <div className="rounded-sm border border-border-soft bg-bg-elev-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-muted">
        A purchase order captures <strong className="font-semibold text-fg-strong">cost</strong> — what we
        pay the vendor — and ties it to the {getName('work_order').toLowerCase()}. The same parts bill at a{' '}
        <strong className="font-semibold text-fg-strong">price</strong> on the {getName('quote').toLowerCase()};
        margin is the gap.
      </div>
    </div>
  );
}

function PORow({ po }: { po: PurchaseOrderListItem }) {
  const field = po.type === 'FIELD';
  // Cancelled stays in the list but de-emphasized (muted, dimmed) — it's out of
  // the open/committed rollups.
  const cancelled = po.status === 'CANCELLED';
  return (
    <Link
      to={`/purchase-orders/${po.id}`}
      className={`flex w-full items-center gap-3 border-b border-border-soft px-4 py-3 text-left last:border-b-0 hover:bg-bg-hover ${cancelled ? 'opacity-55' : ''}`}
    >
      <span
        className="grid size-[30px] shrink-0 place-items-center rounded-md"
        style={{
          background: field
            ? 'color-mix(in oklch, var(--info-500) 13%, var(--bg-elev))'
            : 'color-mix(in oklch, var(--accent-500) 13%, var(--bg-elev))',
          color: field ? 'var(--info-500)' : 'var(--accent-700)',
        }}
      >
        {field ? <ReceiptPercentIcon className="size-4" /> : <CubeIcon className="size-4" />}
      </span>

      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="shrink-0 font-mono text-[12.5px] font-bold text-fg-strong">{po.poNumber}</span>
          <span className="truncate text-[12.5px] text-fg-strong">{po.vendorName}</span>
          <PoTypeBadge type={po.type} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-dim">
          <span>
            {po.itemCount} {po.itemCount === 1 ? 'item' : 'items'}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDate(po.createdAt)}</span>
          {po.eta && (
            <>
              <span aria-hidden>·</span>
              <span>ETA {formatDate(po.eta)}</span>
            </>
          )}
        </div>
      </div>

      <Pill tone={PO_STATUS_TONE[po.status]} dot={poStatusHasDot(po.status)}>
        {PO_STATUS_LABEL[po.status]}
      </Pill>

      <div className="flex w-24 shrink-0 flex-col items-end">
        <span className="font-mono text-[13.5px] font-bold tabular-nums text-fg-strong">
          {currency.format(po.totalCost ?? 0)}
        </span>
        <span className="text-[10px] text-fg-dim">cost</span>
      </div>

      <span className="shrink-0 text-[12px] font-semibold text-fg-accent">Open →</span>
    </Link>
  );
}
