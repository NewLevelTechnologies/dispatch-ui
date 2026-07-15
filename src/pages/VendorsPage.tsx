/* eslint-disable i18next/no-literal-string -- dense records list; short column/label strings stay literal. Vendor is not a glossary entity; its name comes from t('entities.vendor(s)'). */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TruckIcon } from '@heroicons/react/24/outline';
import { vendorApi, type VendorKind } from '../api';
import AppLayout from '../components/AppLayout';
import { formatTimestamp } from '../lib/formatTimestamp';
import { extractApiError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

// Vendors — Records list of the managed vendor set (who we buy from). A vendor
// holds the account details a PO inherits. Backend returns all active vendors
// (name-ASC) with computed rollups (openPOs / ytdSpend / lastOrder), so search
// + kind filtering are client-side and there's no paging. Rows open the detail.
const KIND_LABEL: Record<VendorKind, string> = {
  DISTRIBUTOR: 'Distributor',
  MANUFACTURER: 'Manufacturer',
  RETAIL: 'Retail',
  OTHER: 'Other',
};
const FILTER_KINDS: VendorKind[] = ['DISTRIBUTOR', 'MANUFACTURER', 'RETAIL'];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n?: number | null) => currency.format(n ?? 0);

export default function VendorsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<VendorKind | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendors', 'list'],
    queryFn: () => vendorApi.search(),
  });
  const vendors = useMemo(() => data ?? [], [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter(
      (v) =>
        (!kind || v.kind === kind) &&
        (!q || v.name.toLowerCase().includes(q) || (v.accountNumber ?? '').toLowerCase().includes(q)),
    );
  }, [vendors, search, kind]);

  const openTotal = vendors.reduce((s, v) => s + (v.openPOs ?? 0), 0);
  const spendTotal = vendors.reduce((s, v) => s + (v.ytdSpend ?? 0), 0);
  const subtitle =
    vendors.length === 0 && !isLoading
      ? null
      : `${vendors.length.toLocaleString()} ${vendors.length === 1 ? t('entities.vendor').toLowerCase() : t('entities.vendors').toLowerCase()} · ${openTotal} open POs · ${money(spendTotal)} YTD`;

  const hasFilters = !!search.trim() || !!kind;

  return (
    <AppLayout>
      <div>
        <PageHead
          title={t('entities.vendors')}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={() => navigate('/vendors/new')}>
              {t('common.actions.add', { entity: t('entities.vendor') })}
            </Button>
          }
        />

        <ListToolbar
          search={<ListSearch placeholder="Search vendor or account…" value={search} onChange={setSearch} />}
        >
          <FilterChipRow>
            {FILTER_KINDS.map((k) => (
              <FilterChip
                key={k}
                label={KIND_LABEL[k]}
                active={kind === k}
                onToggle={() => setKind(kind === k ? null : k)}
              />
            ))}
          </FilterChipRow>
        </ListToolbar>

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('common.actions.loading', { entities: t('entities.vendors') })} />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: t('entities.vendors') })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<TruckIcon className="size-10 text-fg-dim" />}
                title={
                  hasFilters
                    ? t('common.actions.noMatchFilters', { entities: t('entities.vendors') })
                    : t('common.actions.noEntitiesYet', { entities: t('entities.vendors') })
                }
                action={
                  hasFilters ? (
                    <Button
                      outline
                      onClick={() => {
                        setSearch('');
                        setKind(null);
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <DenseTable className="dense-stack">
                  <DenseTHead>
                    <tr>
                      <th>Vendor</th>
                      <th>Account</th>
                      <th>Terms</th>
                      <th className="right">Open POs</th>
                      <th className="right">YTD spend</th>
                      <th>Last order</th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {rows.map((v) => (
                      <DenseRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/vendors/${v.id}`)}>
                        <td>
                          <div className="flex items-center gap-2">
                            <CellStack>
                              <CellTop>
                                <span className="font-semibold text-fg-strong">{v.name}</span>
                              </CellTop>
                              {v.kind && (
                                <CellSub>
                                  <span>{KIND_LABEL[v.kind]}</span>
                                </CellSub>
                              )}
                            </CellStack>
                            {v.preferred && <Pill tone="success" dot>Preferred</Pill>}
                          </div>
                        </td>
                        <td className="muted font-mono" data-label="Account">
                          {v.accountNumber || <span className="text-fg-dim">—</span>}
                        </td>
                        <td className="muted" data-label="Terms">
                          {v.paymentTerms || <span className="text-fg-dim">—</span>}
                        </td>
                        <td className="right num" data-label="Open POs">
                          {v.openPOs ? v.openPOs : <span className="text-fg-dim">—</span>}
                        </td>
                        <td className="right num" data-label="YTD spend">
                          <span className="font-mono font-semibold text-fg-strong">{money(v.ytdSpend)}</span>
                        </td>
                        <td className="muted" data-label="Last order">
                          {v.lastOrder ? formatTimestamp(v.lastOrder) : <span className="text-fg-dim">—</span>}
                        </td>
                      </DenseRow>
                    ))}
                  </tbody>
                </DenseTable>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
