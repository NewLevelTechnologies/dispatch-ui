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
};
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  BILLED: 'Billed',
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
const money0 = (n?: number | null) => '$' + Math.round(n ?? 0).toLocaleString('en-US');

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
              {vendor.kind && <Tag>{KIND_LABEL[vendor.kind]}</Tag>}
            </div>
            {vendor.address && <div className="mt-1 text-[11.5px] text-fg-muted">{vendor.address}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button href={`/vendors/${vendor.id}/edit`} outline size="xs">
              <PencilSquareIcon data-slot="icon" />
              Edit
            </Button>
            <Button href={`/purchase-orders/new?type=order&vendorId=${vendor.id}`} color="accent" size="xs">
              <PlusIcon data-slot="icon" />
              New PO
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_320px]">
          {/* Left: PO history + notes */}
          <div className="flex min-w-0 flex-col gap-3">
            <Card title="Purchase orders" subtitle={pos.length ? String(pos.length) : undefined}>
              {pos.length === 0 ? (
                <Text size="sm" tone="muted">
                  No purchase orders yet.
                </Text>
              ) : (
                <div className="-mx-3.5 -mb-3.5">
                  {pos.map((po) => (
                    <Link
                      key={po.id}
                      to={`/purchase-orders/${po.id}`}
                      className="flex items-center gap-2.5 border-b border-border-soft px-3.5 py-2.5 last:border-b-0 hover:bg-bg-hover"
                    >
                      <span className="shrink-0 font-mono text-[12px] font-bold text-fg-strong">{po.poNumber}</span>
                      <Tag>{TYPE_LABEL[po.type]}</Tag>
                      <span className="truncate text-[11.5px] text-fg-muted">{po.workOrderId ? 'Work order' : 'Stock'}</span>
                      <span className="grow" />
                      <Pill tone={STATUS_TONE[po.status]} dot>
                        {STATUS_LABEL[po.status]}
                      </Pill>
                      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-fg-strong">{money(po.totalCost)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            {vendor.notes && (
              <Card title="Notes">
                <Text size="sm" className="leading-relaxed">
                  {vendor.notes}
                </Text>
              </Card>
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-3">
            <Card title="Account">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <KV label="Account #" value={vendor.accountNumber || '—'} mono />
                <KV label="Terms" value={vendor.paymentTerms || '—'} />
                <KV label="Default tax" value={taxLabel} />
                <KV label="Ordering" value={vendor.orderingMethod || '—'} />
              </div>
            </Card>
            <Card title="Contact">
              <div className="flex flex-col gap-1.5">
                {vendor.rep && <KV label="Rep" value={vendor.rep} />}
                {vendor.phone && (
                  <a href={`tel:${vendor.phone.replace(/[^0-9]/g, '')}`} className="font-mono text-[12.5px] font-semibold text-fg-accent">
                    {vendor.phone}
                  </a>
                )}
                {vendor.email && <span className="font-mono text-[11.5px] text-fg-muted">{vendor.email}</span>}
                {!vendor.rep && !vendor.phone && !vendor.email && (
                  <Text size="sm" tone="muted">
                    No contact on file.
                  </Text>
                )}
              </div>
            </Card>
            <Card title="Activity">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <KV label="Open POs" value={String(vendor.openPOs ?? 0)} />
                <KV label="YTD spend" value={money0(vendor.ytdSpend)} />
                <KV label="Last order" value={vendor.lastOrder ? formatTimestamp(vendor.lastOrder) : '—'} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="label-tiny mb-0.5">{label}</span>
      <span className={`text-[12.5px] font-medium text-fg-strong ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
