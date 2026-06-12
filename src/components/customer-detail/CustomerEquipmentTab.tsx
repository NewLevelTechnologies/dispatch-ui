/* eslint-disable i18next/no-literal-string -- dense detail page; entity names use t()/glossary, short column labels/separators stay literal to match ServiceLocationDetailPage. */
// Customer equipment tab — the flat roll-up across all of the customer's
// locations, with the Location detail equipment tab's toolbar (search +
// Open-work-order / Warranty-expired filter chips with server-side count
// badges) + server-side pagination. Scoped to the customer; the "Location"
// column names which site each unit sits at (vs the Location page's
// "Location on site" spot column). Parent owns the add/edit dialog + delete
// confirmation; this renders + delegates via callbacks.
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { equipmentApi, EquipmentStatus, type EquipmentSummary, type ListEquipmentParams } from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { ErrorState } from '../ui/ErrorState';
import EquipmentThumbnail from '../EquipmentThumbnail';
import IconButton from '../IconButton';
import { extractApiError } from '../../lib/toast';

type EquipFilter = 'open-wo' | 'warranty' | null;
const PAGE_SIZE = 25;

function typeCategory(item: EquipmentSummary): string {
  if (item.equipmentTypeName && item.equipmentCategoryName) {
    return `${item.equipmentTypeName} / ${item.equipmentCategoryName}`;
  }
  return item.equipmentTypeName || item.equipmentCategoryName || '—';
}

function makeModel(item: EquipmentSummary): string {
  if (item.make && item.model) return `${item.make} ${item.model}`;
  return item.make || item.model || '—';
}

function locationAddress(item: EquipmentSummary): string {
  const parts: string[] = [];
  if (item.streetAddress) parts.push(item.streetAddress);
  const cityState = [item.city, item.state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  return parts.join(', ');
}

export default function CustomerEquipmentTab({
  customerId,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  customerId: string;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (item: EquipmentSummary) => void;
  onDelete: (item: EquipmentSummary) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<EquipFilter>(null);
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(q.trim());

  const resetPage = () => setPage(1);

  const listParams: ListEquipmentParams = {
    customerId,
    status: EquipmentStatus.ACTIVE,
    search: deferredSearch || undefined,
    warrantyExpired: filter === 'warranty' ? true : undefined,
    hasOpenWorkOrder: filter === 'open-wo' ? true : undefined,
    page: page - 1,
    size: PAGE_SIZE,
  };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['equipment', listParams],
    queryFn: () => equipmentApi.list(listParams),
    enabled: !!customerId,
  });
  const rows = useMemo(() => data?.content ?? [], [data]);
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  // Chip counts from the server (size:1 → totalElements), independent of search
  // and the other chip, so they survive pagination.
  const { data: openWoCount } = useQuery({
    queryKey: ['equipment-count', 'customer', customerId, 'open-wo'],
    queryFn: () =>
      equipmentApi
        .list({ customerId, status: EquipmentStatus.ACTIVE, hasOpenWorkOrder: true, size: 1 })
        .then((p) => p.totalElements),
    enabled: !!customerId,
  });
  const { data: warrantyCount } = useQuery({
    queryKey: ['equipment-count', 'customer', customerId, 'warranty'],
    queryFn: () =>
      equipmentApi
        .list({ customerId, status: EquipmentStatus.ACTIVE, warrantyExpired: true, size: 1 })
        .then((p) => p.totalElements),
    enabled: !!customerId,
  });

  const hasFilters = !!deferredSearch || filter !== null;
  const chips: { id: Exclude<EquipFilter, null>; label: string; count: number }[] = [
    { id: 'open-wo', label: 'Open work order', count: openWoCount ?? 0 },
    { id: 'warranty', label: 'Warranty expired', count: warrantyCount ?? 0 },
  ];

  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="Search by ID, make, model, serial…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {q && (
            <button onClick={() => { setQ(''); resetPage(); }} className="px-1 text-[11px] text-fg-dim hover:text-fg-strong">
              ×
            </button>
          )}
        </div>

        {chips.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => { setFilter(active ? null : c.id); resetPage(); }}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium ${
                active
                  ? 'border-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))] bg-[color-mix(in_oklch,var(--accent-500)_9%,var(--bg-elev))] text-fg-accent'
                  : 'border-border bg-bg-elev text-fg'
              }`}
            >
              {c.label}
              <span
                className={`rounded px-1.5 font-mono text-[10.5px] font-semibold tabular-nums ${active ? 'bg-[color-mix(in_oklch,var(--accent-500)_18%,var(--bg-elev))] text-fg-accent' : 'bg-bg-active text-fg-dim'}`}
              >
                {c.count}
              </span>
            </button>
          );
        })}

        {filter && (
          <Button plain size="xs" onClick={() => { setFilter(null); resetPage(); }}>
            Clear
          </Button>
        )}

        <span className="grow" />
        {canEdit && (
          <Button color="accent" size="xs" onClick={onAdd}>
            <PlusIcon className="size-4" />
            {t('common.actions.add', { entity: getName('equipment') })}
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('equipment', true) })}
          </div>
        ) : error ? (
          <ErrorState
            title={t('common.actions.couldNotLoad', { entities: getName('equipment', true), defaultValue: `Couldn't load ${getName('equipment', true)}` })}
            description={extractApiError(error) ?? (error as Error).message}
            action={<Button outline onClick={() => refetch()}>{t('common.actions.tryAgain', { defaultValue: 'Try again' })}</Button>}
          />
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {hasFilters ? 'No equipment matches' : t('common.actions.noEntitiesYet', { entities: getName('equipment', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {hasFilters ? 'Adjust your search or clear filters.' : 'Add equipment to get started.'}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('common.form.name')}</th>
                    <th>{getName('service_location')}</th>
                    <th>{t('equipment.table.type')}</th>
                    <th>{t('equipment.table.makeModel')}</th>
                    <th>{t('equipment.form.serialNumber')}</th>
                    <th>{t('equipment.form.locationOnSite')}</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((item) => (
                    <DenseRow key={item.id}>
                      <td>
                        <Link
                          to={`/equipment/${item.id}`}
                          className="flex items-center gap-2 text-fg-strong hover:text-fg-accent hover:underline"
                        >
                          <EquipmentThumbnail url={item.profileImageUrl} name={item.name} sizeClass="size-9" fit="contain" />
                          <span className="font-medium">{item.name}</span>
                        </Link>
                      </td>
                      <td className="muted">
                        {item.serviceLocationId ? (
                          <Link
                            to={`/service-locations/${item.serviceLocationId}?from=customer`}
                            className="hover:text-fg-accent hover:underline"
                          >
                            <CellStack>
                              <CellTop>{item.serviceLocationName || locationAddress(item) || '—'}</CellTop>
                              {item.serviceLocationName && locationAddress(item) && (
                                <CellSub>{locationAddress(item)}</CellSub>
                              )}
                            </CellStack>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="muted">{typeCategory(item)}</td>
                      <td className="muted">{makeModel(item)}</td>
                      <td className="muted">{item.serialNumber || '—'}</td>
                      <td className="muted">{item.locationOnSite || '—'}</td>
                      <td className="right">
                        {canEdit && (
                          <Dropdown>
                            <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                              <EllipsisVerticalIcon className="size-4" />
                            </DropdownButton>
                            <DropdownMenu anchor="bottom end">
                              <DropdownItem onClick={() => onEdit(item)}>
                                <DropdownLabel>{t('common.edit')}</DropdownLabel>
                              </DropdownItem>
                              <DropdownItem onClick={() => onDelete(item)}>
                                <DropdownLabel>{t('common.delete')}</DropdownLabel>
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        )}
                      </td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
            </div>
            <div className="flex items-center justify-between border-t border-border-soft bg-bg-elev-2 px-4 py-2.5 text-[11.5px] text-fg-muted">
              <span>
                {t('common.pagination.showing', { start: showingStart, end: showingEnd, total: total.toLocaleString() })}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button plain size="xxs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </Button>
                  <span className="font-mono text-[11px] tabular-nums text-fg">
                    {page} / {totalPages}
                  </span>
                  <Button plain size="xxs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
