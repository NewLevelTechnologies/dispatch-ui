/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline labels/separators stay literal to match ServiceLocationDetailPage. */
// MULTI Locations tab — the dense table that proves the page scales to a
// many-location customer. Toolbar (search + status chips + Add) → DenseTable →
// count footer. Search + status are always available; once the customer detail
// payload carries per-location enrichment (LOC-1: hasOpenJobs / openJobsCount /
// lastServiceAt / balance), the operational/financial columns and the "Has open
// jobs" chip light up. PM visit status (pmOverdue / nextVisitDue) is a separate
// work-order call merged by serviceLocationId — it drives the "Next visit"
// column + "Visit overdue" chip. Each surface stays hidden (not inert) until
// its backing data is present.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import clsx from 'clsx';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  agreementApi,
  dispatchRegionApi,
  equipmentApi,
  EquipmentStatus,
  type Customer,
  type ServiceLocation,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { formatPhone } from '@dispatch/utils';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Input, InputGroup } from '../catalyst/input';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import { titleCaseAddress } from '../../utils/titleCaseAddress';
import { formatDateShort, formatMoney } from './format';

type StatusFilter = ServiceLocation['status'];

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'INACTIVE', label: 'Inactive' },
  { id: 'CLOSED', label: 'Closed' },
];

export default function MultiLocationsTab({
  customer,
  canAdd,
  onAdd,
}: {
  customer: Customer;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [openJobsOnly, setOpenJobsOnly] = useState(false);
  const [visitOverdueOnly, setVisitOverdueOnly] = useState(false);

  // The operational/financial columns + the "Has open jobs" chip only render
  // once the detail payload carries the LOC-1 denorm. Detect it from any row so
  // the table stays at its lean 5-column shape pre-deploy (honest, not inert).
  const hasEnrichment = useMemo(
    () =>
      customer.serviceLocations.some(
        (l) => l.hasOpenJobs !== undefined || l.openJobsCount !== undefined || l.balance !== undefined,
      ),
    [customer.serviceLocations],
  );

  const { data: equipmentPage } = useQuery({
    queryKey: ['equipment', { customerId: customer.id }],
    queryFn: () => equipmentApi.list({ customerId: customer.id, status: EquipmentStatus.ACTIVE, size: 100 }),
    enabled: !!customer.id,
  });
  const { data: regions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });
  // LOC-1 Phase 3 — per-location PM visit status (separate work-order call,
  // merged by serviceLocationId). Only locations with a PM obligation appear.
  const { data: visitStatus } = useQuery({
    queryKey: ['agreement-visit-status', customer.id],
    queryFn: () => agreementApi.getVisitStatus(customer.id),
    enabled: !!customer.id,
  });

  const visitByLocation = useMemo(() => {
    const m: Record<string, { pmOverdue: boolean; nextVisitDue: string | null }> = {};
    for (const v of visitStatus ?? []) m[v.serviceLocationId] = { pmOverdue: v.pmOverdue, nextVisitDue: v.nextVisitDue };
    return m;
  }, [visitStatus]);
  const hasVisitStatus = (visitStatus?.length ?? 0) > 0;

  const equipByLocation = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of equipmentPage?.content ?? []) {
      if (e.serviceLocationId) acc[e.serviceLocationId] = (acc[e.serviceLocationId] ?? 0) + 1;
    }
    return acc;
  }, [equipmentPage]);

  const regionMap = useMemo(() => {
    const list = (regions ?? []) as Array<{ id: string; name: string; abbreviation?: string | null }>;
    const m: Record<string, string> = {};
    for (const r of list) m[r.id] = r.abbreviation || r.name;
    return m;
  }, [regions]);

  const rows = useMemo(() => {
    let r = customer.serviceLocations;
    if (status) r = r.filter((l) => l.status === status);
    if (openJobsOnly) r = r.filter((l) => l.hasOpenJobs);
    if (visitOverdueOnly) r = r.filter((l) => visitByLocation[l.id]?.pmOverdue);
    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(
        (l) =>
          l.locationName?.toLowerCase().includes(needle) ||
          l.address.streetAddress.toLowerCase().includes(needle) ||
          l.address.city.toLowerCase().includes(needle) ||
          l.address.state.toLowerCase().includes(needle) ||
          l.siteContactName?.toLowerCase().includes(needle) ||
          l.siteContactPhone?.toLowerCase().includes(needle),
      );
    }
    return r;
  }, [customer.serviceLocations, q, status, openJobsOnly, visitOverdueOnly, visitByLocation]);

  const total = customer.serviceLocations.length;

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <InputGroup className="max-w-[360px] flex-1">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, address, city, contact…"
          />
        </InputGroup>

        {STATUS_CHIPS.map((c) => {
          const active = status === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setStatus(active ? null : c.id)}
              className={`inline-flex h-[30px] items-center rounded-md border px-2.5 text-[12px] font-medium ${
                active
                  ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent'
                  : 'border-border bg-bg-elev text-fg hover:bg-bg-hover'
              }`}
            >
              {c.label}
            </button>
          );
        })}

        {hasEnrichment && (
          <button
            type="button"
            onClick={() => setOpenJobsOnly((v) => !v)}
            className={`inline-flex h-[30px] items-center rounded-md border px-2.5 text-[12px] font-medium ${
              openJobsOnly
                ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent'
                : 'border-border bg-bg-elev text-fg hover:bg-bg-hover'
            }`}
          >
            Has open {getName('work_order', true).toLowerCase()}
          </button>
        )}

        {hasVisitStatus && (
          <button
            type="button"
            onClick={() => setVisitOverdueOnly((v) => !v)}
            className={`inline-flex h-[30px] items-center rounded-md border px-2.5 text-[12px] font-medium ${
              visitOverdueOnly
                ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent'
                : 'border-border bg-bg-elev text-fg hover:bg-bg-hover'
            }`}
          >
            Visit overdue
          </button>
        )}

        {(status || openJobsOnly || visitOverdueOnly) && (
          <Button
            plain
            size="xs"
            onClick={() => {
              setStatus(null);
              setOpenJobsOnly(false);
              setVisitOverdueOnly(false);
            }}
          >
            Clear
          </Button>
        )}

        <span className="grow" />

        {canAdd && (
          <Button color="accent" size="xs" onClick={onAdd}>
            <PlusIcon className="size-4" />
            {t('common.actions.add', { entity: getName('service_location') })}
          </Button>
        )}
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>{getName('service_location')}</th>
              <th>{getName('dispatch_region')}</th>
              <th>Status</th>
              <th>Primary contact</th>
              {hasEnrichment && <th className="right">Open</th>}
              {hasEnrichment && <th>Last service</th>}
              {hasVisitStatus && <th>Next visit</th>}
              {hasEnrichment && <th className="right">Balance</th>}
              <th className="right">{getName('equipment')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5 + (hasEnrichment ? 3 : 0) + (hasVisitStatus ? 1 : 0)} className="px-3.5 py-10 text-center">
                  <div className="text-[13px] font-semibold text-fg-strong">
                    No {getName('service_location', true).toLowerCase()} match your filters
                  </div>
                  <div className="mt-1 text-[12px] text-fg-muted">Try clearing or adjusting filters.</div>
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const region = l.dispatchRegionName ?? regionMap[l.dispatchRegionId];
                const equip = equipByLocation[l.id] ?? 0;
                const vs = visitByLocation[l.id];
                const street = titleCaseAddress(
                  [l.address.streetAddress, l.address.streetAddressLine2].filter(Boolean).join(' '),
                );
                const stateZip = [l.address.state, l.address.zipCode].filter(Boolean).join(' ');
                const cityLine = [titleCaseAddress(l.address.city), stateZip].filter(Boolean).join(', ');
                return (
                  <DenseRow key={l.id} onClick={() => navigate(`/service-locations/${l.id}?from=customer`)}>
                    <td>
                      <CellStack>
                        <CellTop>{l.locationName || `Unnamed ${getName('service_location').toLowerCase()}`}</CellTop>
                        <CellSub>{[street, cityLine].filter(Boolean).join(' · ')}</CellSub>
                      </CellStack>
                    </td>
                    <td className="muted dt-mobile-hide">{region || '—'}</td>
                    <td>
                      <Pill tone={l.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                        {l.status === 'ACTIVE' ? 'Active' : l.status === 'CLOSED' ? 'Closed' : 'Inactive'}
                      </Pill>
                    </td>
                    <td className={clsx('muted', !l.siteContactName && 'dt-empty')}>
                      {l.siteContactName ? (
                        <CellStack>
                          <CellTop>
                            <span className="dt-inline-label">Contact: </span>
                            {l.siteContactName}
                          </CellTop>
                          {l.siteContactPhone && <CellSub>{formatPhone(l.siteContactPhone)}</CellSub>}
                        </CellStack>
                      ) : (
                        '—'
                      )}
                    </td>
                    {hasEnrichment && (
                      <td className="right num strong dt-mobile-hide">
                        {l.openJobsCount && l.openJobsCount > 0 ? (
                          l.openJobsCount
                        ) : (
                          <span className="text-fg-dim">—</span>
                        )}
                      </td>
                    )}
                    {hasEnrichment && (
                      <td className={clsx('muted', !l.lastServiceAt && 'dt-empty')} data-label="Last service">
                        {l.lastServiceAt ? formatDateShort(l.lastServiceAt) : <span className="text-fg-dim">—</span>}
                      </td>
                    )}
                    {hasVisitStatus && (
                      <td className="muted dt-mobile-hide">
                        {!vs ? (
                          <span className="text-fg-dim">—</span>
                        ) : vs.pmOverdue ? (
                          <span className="font-semibold" style={{ color: 'var(--danger-500)' }}>
                            Overdue{vs.nextVisitDue ? ` · ${formatDateShort(vs.nextVisitDue)}` : ''}
                          </span>
                        ) : vs.nextVisitDue ? (
                          formatDateShort(vs.nextVisitDue)
                        ) : (
                          <span className="text-fg-dim">—</span>
                        )}
                      </td>
                    )}
                    {hasEnrichment && (
                      <td className={clsx('right num', l.balance == null && 'dt-empty')} data-label="Balance">
                        {l.balance == null ? (
                          <span className="text-fg-dim">—</span>
                        ) : l.balance > 0 ? (
                          <span className="font-semibold text-fg-strong">{formatMoney(l.balance)}</span>
                        ) : (
                          <span className="text-fg-dim">$0</span>
                        )}
                      </td>
                    )}
                    <td className={clsx('right num strong', equip === 0 && 'dt-empty')}>
                      {equip > 0 ? (
                        <>
                          {equip}
                          <span className="ml-1 hidden text-[10px] font-medium text-fg-muted max-sm:inline">
                            {getName('equipment')}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-dim">—</span>
                      )}
                    </td>
                  </DenseRow>
                );
              })
            )}
          </tbody>
        </DenseTable>
        </div>
        <div className="flex items-center border-t border-border-soft bg-bg-elev-2 px-4 py-2.5 text-[11.5px] text-fg-muted">
          Showing <strong className="mx-1 text-fg-strong">{rows.length}</strong> of {total}
        </div>
      </Card>
    </div>
  );
}
