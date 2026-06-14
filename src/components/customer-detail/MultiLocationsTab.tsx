/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline labels/separators stay literal to match ServiceLocationDetailPage. */
// MULTI Locations tab — the dense table that proves the page scales to a
// many-location customer. Toolbar (search + status chips + Add) → DenseTable →
// count footer. Search + status are always available; once the customer detail
// payload carries per-location enrichment (LOC-1: hasOpenJobs / openJobsCount /
// lastServiceAt / balance), the operational/financial columns and the "Has open
// jobs" chip light up. They stay hidden (not inert) before that lands. The
// "Visit overdue" chip needs pmOverdue and is still Phase 3.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  dispatchRegionApi,
  equipmentApi,
  EquipmentStatus,
  type Customer,
  type ServiceLocation,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { formatPhone } from '../../utils/formatPhone';
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
  }, [customer.serviceLocations, q, status, openJobsOnly]);

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

        {(status || openJobsOnly) && (
          <Button
            plain
            size="xs"
            onClick={() => {
              setStatus(null);
              setOpenJobsOnly(false);
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
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>{getName('service_location')}</th>
              <th>{getName('dispatch')} {t('entities.region')}</th>
              <th>Status</th>
              <th>Primary contact</th>
              {hasEnrichment && <th className="right">Open</th>}
              {hasEnrichment && <th>Last service</th>}
              {hasEnrichment && <th className="right">Balance</th>}
              <th className="right">{getName('equipment')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={hasEnrichment ? 8 : 5} className="px-3.5 py-10 text-center">
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
                    <td className="muted">{region || '—'}</td>
                    <td>
                      <Pill tone={l.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                        {l.status === 'ACTIVE' ? 'Active' : l.status === 'CLOSED' ? 'Closed' : 'Inactive'}
                      </Pill>
                    </td>
                    <td className="muted">
                      {l.siteContactName ? (
                        <CellStack>
                          <CellTop>{l.siteContactName}</CellTop>
                          {l.siteContactPhone && <CellSub>{formatPhone(l.siteContactPhone)}</CellSub>}
                        </CellStack>
                      ) : (
                        '—'
                      )}
                    </td>
                    {hasEnrichment && (
                      <td className="right num strong">
                        {l.openJobsCount && l.openJobsCount > 0 ? (
                          l.openJobsCount
                        ) : (
                          <span className="text-fg-dim">—</span>
                        )}
                      </td>
                    )}
                    {hasEnrichment && (
                      <td className="muted">
                        {l.lastServiceAt ? formatDateShort(l.lastServiceAt) : <span className="text-fg-dim">—</span>}
                      </td>
                    )}
                    {hasEnrichment && (
                      <td className="right num">
                        {l.balance == null ? (
                          <span className="text-fg-dim">—</span>
                        ) : l.balance > 0 ? (
                          <span className="font-semibold text-fg-strong">{formatMoney(l.balance)}</span>
                        ) : (
                          <span className="text-fg-dim">$0</span>
                        )}
                      </td>
                    )}
                    <td className="right num strong">
                      {equip > 0 ? equip : <span className="text-fg-dim">—</span>}
                    </td>
                  </DenseRow>
                );
              })
            )}
          </tbody>
        </DenseTable>
        <div className="flex items-center border-t border-border-soft bg-bg-elev-2 px-4 py-2.5 text-[11.5px] text-fg-muted">
          Showing <strong className="mx-1 text-fg-strong">{rows.length}</strong> of {total}
        </div>
      </Card>
    </div>
  );
}
