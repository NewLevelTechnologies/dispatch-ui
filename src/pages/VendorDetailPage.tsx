/* eslint-disable i18next/no-literal-string -- dense records detail; short labels stay literal. Vendor is not a glossary entity; its name comes from t('entities.vendor'). */
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BuildingStorefrontIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  vendorApi,
  purchaseOrderApi,
  type PurchaseOrderStatus,
  type VendorKind,
} from '../api';
import { formatTimestamp } from '../lib/formatTimestamp';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Text } from '../components/catalyst/text';
import { Pill, Tag } from '../components/ui/Pill';
import { LoadingState } from '../components/ui/LoadingState';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';
const STATUS_TONE: Record<PurchaseOrderStatus, PillTone> = {
  DRAFT: 'neutral',
  ORDERED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'violet',
  CANCELLED: 'neutral',
};
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  BILLED: 'Billed',
  CANCELLED: 'Cancelled',
};
const TYPE_LABEL = { FIELD: 'Field purchase', ORDER: 'Special order', STOCK: 'Stock' } as const;
const KIND_LABEL: Record<VendorKind, string> = {
  DISTRIBUTOR: 'Distributor',
  MANUFACTURER: 'Manufacturer',
  RETAIL: 'Retail',
  OTHER: 'Other',
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n?: number | null) => currency.format(n ?? 0);

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: vendor, isLoading, isError } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => vendorApi.getById(id!),
    enabled: !!id,
  });
  const { data: poPage } = useQuery({
    queryKey: ['purchase-orders', 'vendor', id],
    queryFn: () => purchaseOrderApi.list({ vendorId: id!, size: 100 }),
    enabled: !!id,
  });
  const pos = poPage?.content ?? [];

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingState label="Loading vendor…" />
      </AppLayout>
    );
  }
  if (isError || !vendor) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1080px] py-10 text-center">
          <Text className="!text-sm !text-rose-600 dark:!text-rose-400">Couldn't load this vendor.</Text>
          <Button plain size="xs" className="mt-3" onClick={() => navigate('/vendors')}>
            ← Vendors
          </Button>
        </div>
      </AppLayout>
    );
  }

  const taxLabel = vendor.taxRate != null ? `${(vendor.taxRate * 100).toFixed(1)}%` : '—';

  // Facts strip — account + contact + activity as one ordered band under the
  // header. Contact collapses to a single cell (rep → phone → none), linked as
  // a tel: when it's a phone so it stays actionable.
  const contactValue = vendor.rep || vendor.phone || 'None on file';
  const contactHref = vendor.phone ? `tel:${vendor.phone.replace(/[^0-9]/g, '')}` : undefined;
  const facts: { label: string; value: string; mono?: boolean; href?: string }[] = [
    { label: 'Account #', value: vendor.accountNumber || '—', mono: true },
    { label: 'Terms', value: vendor.paymentTerms || '—' },
    { label: 'Default tax', value: taxLabel },
    { label: 'Ordering', value: vendor.orderingMethod || '—' },
    { label: 'Contact', value: contactValue, href: contactHref },
    { label: 'Open POs', value: String(vendor.openPOs ?? 0) },
    { label: 'YTD spend', value: money(vendor.ytdSpend) },
    { label: 'Last order', value: vendor.lastOrder ? formatTimestamp(vendor.lastOrder) : '—' },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1080px] px-1 py-1">
        <Link to="/vendors" className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
          ← Vendors
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3.5 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm">
          <span className="grid size-[46px] shrink-0 place-items-center rounded-[10px]" style={{ background: 'color-mix(in oklch, var(--accent-500) 13%, var(--bg-elev))', color: 'var(--accent-700)' }}>
            <BuildingStorefrontIcon className="size-6" />
          </span>
          <div className="min-w-[220px] grow">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[18px] font-bold tracking-tight text-fg-strong">{vendor.name}</h1>
              {vendor.preferred && <Pill tone="success" dot>Preferred</Pill>}
              {vendor.kind && <Tag word>{KIND_LABEL[vendor.kind]}</Tag>}
            </div>
            {vendor.address && <div className="mt-1 text-[11.5px] text-fg-muted">{vendor.address}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button href={`/vendors/${vendor.id}/edit`} outline size="xs">
              <PencilSquareIcon data-slot="icon" />
              Edit
            </Button>
            <Button
              href={`/purchase-orders/new?type=order&vendorId=${vendor.id}&from=vendor&vName=${encodeURIComponent(vendor.name)}`}
              color="accent"
              size="xs"
            >
              <PlusIcon data-slot="icon" />
              New PO
            </Button>
          </div>
        </div>

        {/* Facts strip — account + contact + activity as one horizontal band
            under the header, so a lightly-populated vendor stays balanced
            instead of a tall rail beside a near-empty PO column. A flex-wrap
            band (cells flex 1 1 130px), NOT a fixed grid — the count per row
            adapts to width. Dividers are drawn with each cell's left+top border
            and the outer border/overflow clips the first row's/column's edges,
            so wrapped rows pick up a top divider automatically. */}
        <div className="mt-3 overflow-hidden rounded-[10px] border border-border bg-bg-elev">
          <div className="-ml-px -mt-px flex flex-wrap">
            {facts.map((f) => (
              <div
                key={f.label}
                className="min-w-[130px] flex-[1_1_130px] border-l border-t border-border-soft px-3.5 py-2.5"
              >
                <div className="label-tiny">{f.label}</div>
                {f.href ? (
                  <a href={f.href} className="mt-0.5 block truncate font-mono text-[12.5px] font-semibold text-fg-accent">
                    {f.value}
                  </a>
                ) : (
                  <div className={`mt-0.5 truncate text-[12.5px] font-medium text-fg-strong ${f.mono ? 'font-mono' : ''}`}>
                    {f.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* PO history — full width. Count rides the trailing header slot (not a
            subtitle, which would drop it onto its own line under the title). */}
        <Card
          title="Purchase orders"
          action={pos.length > 0 ? <span className="text-[11px] font-medium text-fg-muted">{pos.length}</span> : undefined}
          className="mt-3"
        >
          {pos.length === 0 ? (
            <Text size="sm" tone="muted">
              No purchase orders yet.
            </Text>
          ) : (
            <div className="-mx-3.5 -mb-3.5">
              {pos.map((po) => (
                <Link
                  key={po.id}
                  to={`/purchase-orders/${po.id}?from=vendor&vendorId=${vendor.id}&vName=${encodeURIComponent(vendor.name)}`}
                  className={`flex items-center gap-2.5 border-b border-border-soft px-3.5 py-2.5 last:border-b-0 hover:bg-bg-hover ${po.status === 'CANCELLED' ? 'opacity-55' : ''}`}
                >
                  <span className="shrink-0 font-mono text-[12px] font-bold text-fg-strong">{po.poNumber}</span>
                  <Tag word>{TYPE_LABEL[po.type]}</Tag>
                  <span className="truncate text-[11.5px] text-fg-muted">{po.workOrderId ? 'Work order' : 'Stock'}</span>
                  <span className="grow" />
                  <Pill tone={STATUS_TONE[po.status]} dot>
                    {STATUS_LABEL[po.status]}
                  </Pill>
                  <span className="w-20 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-fg-strong">
                    {money(po.totalCost)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {vendor.notes && (
          <Card title="Notes" className="mt-3">
            <Text size="sm" className="leading-relaxed">
              {vendor.notes}
            </Text>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
