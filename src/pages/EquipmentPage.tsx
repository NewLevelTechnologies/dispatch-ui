import { useState, useDeferredValue } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentSummary,
  type EquipmentSortField,
  type EquipmentSortDirection,
} from '../api';
import AppLayout from '../components/AppLayout';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';

const PAGE_SIZE = 50;

export default function EquipmentPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  // Empty string = "All" (both ACTIVE and RETIRED). Default lands on ACTIVE so
  // retired equipment doesn't crowd the day-to-day view.
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>(EquipmentStatus.ACTIVE);
  const [page, setPage] = useState(0); // 0-indexed
  const [sortBy] = useState<EquipmentSortField>('name');
  const [sortDir] = useState<EquipmentSortDirection>('asc');

  // Defer the search input so we don't fire a request on every keystroke
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
  });

  const { data: equipmentCategories = [] } = useQuery({
    queryKey: ['equipment-categories', typeFilter],
    queryFn: () => equipmentCategoriesApi.getAll(typeFilter || undefined),
    enabled: Boolean(typeFilter),
  });

  const {
    data: equipmentPage,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['equipment', { search: deferredSearch, typeFilter, categoryFilter, statusFilter, page, sortBy, sortDir }],
    queryFn: () =>
      equipmentApi.list({
        search: deferredSearch || undefined,
        equipmentTypeId: typeFilter || undefined,
        equipmentCategoryId: categoryFilter || undefined,
        status: statusFilter || undefined,
        page,
        size: PAGE_SIZE,
        sortBy,
        sortDir,
      }),
  });

  const equipment: EquipmentSummary[] = equipmentPage?.content ?? [];
  const totalElements = equipmentPage?.totalElements ?? 0;
  const totalPages = equipmentPage?.totalPages ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      // Equipment summaries are embedded on workItems[].equipment in WO
      // detail and list responses — refresh both so deleted equipment
      // disappears from row expansions / service history.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorDelete', { entity: getName('equipment') }));
    },
  });

  const handleAdd = () => {
    setSelectedEquipment(null);
    setIsDialogOpen(true);
  };

  const handleEdit = async (item: EquipmentSummary) => {
    // Fetch the full record so the dialog has all fields (description, install date, etc.)
    const full = await equipmentApi.getById(item.id);
    setSelectedEquipment(full);
    setIsDialogOpen(true);
  };

  const handleDelete = (item: EquipmentSummary) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const getStatusBadge = (status: EquipmentStatus | undefined) => {
    if (status === EquipmentStatus.RETIRED) {
      return <Badge color="zinc">{t('equipment.status.retired')}</Badge>;
    }
    // Default to active when the backend omits status (older payloads). Most
    // equipment is active, so this avoids a misleading "Retired" badge.
    return <Badge color="lime">{t('equipment.status.active')}</Badge>;
  };

  const formatTypeCategory = (item: EquipmentSummary) => {
    if (item.equipmentTypeName && item.equipmentCategoryName) {
      return `${item.equipmentTypeName} / ${item.equipmentCategoryName}`;
    }
    return item.equipmentTypeName || item.equipmentCategoryName || '-';
  };

  const formatMakeModel = (item: EquipmentSummary) => {
    if (item.make && item.model) return `${item.make} ${item.model}`;
    return item.make || item.model || '-';
  };

  // Compose the address line from the discrete fields the backend returns.
  // Pieces are joined with ", " then ` ${zip}` so missing trailing fields don't
  // leave dangling commas.
  const formatAddress = (item: EquipmentSummary): string => {
    const parts: string[] = [];
    if (item.streetAddress) parts.push(item.streetAddress);
    const cityState = [item.city, item.state].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    const tail = parts.join(', ');
    return item.zipCode ? `${tail} ${item.zipCode}`.trim() : tail;
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('equipment', true)}</Heading>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: getName('equipment') })}
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <InputGroup className="flex-1 min-w-64 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
          />
        </InputGroup>

        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setCategoryFilter('');
            setPage(0);
          }}
          className="max-w-48"
        >
          <option value="">{t('equipment.filter.allTypes')}</option>
          {equipmentTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>

        <Select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(0);
          }}
          disabled={!typeFilter}
          className="max-w-48"
        >
          <option value="">{t('equipment.filter.allCategories')}</option>
          {equipmentCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as EquipmentStatus | '');
            setPage(0);
          }}
          className="max-w-36"
          aria-label={t('common.form.status')}
        >
          <option value={EquipmentStatus.ACTIVE}>{t('equipment.status.active')}</option>
          <option value={EquipmentStatus.RETIRED}>{t('equipment.status.retired')}</option>
          <option value="">{t('equipment.status.all')}</option>
        </Select>

        {totalElements > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400 ml-auto">
            {t('common.pagination.showing', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalElements),
              total: totalElements,
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('equipment', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: getName('equipment', true) })}
          </p>
        </div>
      ) : equipment.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {deferredSearch || typeFilter || categoryFilter
              ? t('common.actions.noMatchSearch', { entities: getName('equipment', true) })
              : t('common.actions.notFound', { entities: getName('equipment', true) })}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{getName('service_location')}</TableHeader>
                <TableHeader>{t('equipment.table.type')}</TableHeader>
                <TableHeader>{t('equipment.table.makeModel')}</TableHeader>
                <TableHeader>{t('equipment.form.serialNumber')}</TableHeader>
                <TableHeader>{t('equipment.form.locationOnSite')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <RouterLink
                        to={`/equipment/${item.id}`}
                        className="text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                      >
                        <EquipmentThumbnail
                          url={item.profileImageUrl}
                          name={item.name}
                          sizeClass="size-12"
                          fit="contain"
                        />
                      </RouterLink>
                      <div className="flex min-w-0 flex-col">
                        <RouterLink
                          to={`/equipment/${item.id}`}
                          className="truncate text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                        >
                          {item.name}
                        </RouterLink>
                        {item.parentId && item.parentName && (
                          <RouterLink
                            to={`/equipment/${item.parentId}`}
                            className="truncate text-xs text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-500 dark:hover:text-blue-400"
                          >
                            {t('equipment.table.componentOf', {
                              entity: getName('equipment_component'),
                              parent: item.parentName,
                            })}
                          </RouterLink>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.serviceLocationId ? (
                      <RouterLink
                        to={`/service-locations/${item.serviceLocationId}`}
                        className="flex flex-col text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                      >
                        <span>{item.serviceLocationName || formatAddress(item) || '-'}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {[
                            item.serviceLocationName ? formatAddress(item) : null,
                            item.customerName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </RouterLink>
                    ) : (
                      <span>-</span>
                    )}
                  </TableCell>
                  <TableCell>{formatTypeCategory(item)}</TableCell>
                  <TableCell>{formatMakeModel(item)}</TableCell>
                  <TableCell>{item.serialNumber || '-'}</TableCell>
                  <TableCell>{item.locationOnSite || '-'}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                      <Dropdown>
                        <DropdownButton plain aria-label={t('common.moreOptions')}>
                          <EllipsisVerticalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => handleEdit(item)}>
                            <DropdownLabel>{t('common.edit')}</DropdownLabel>
                          </DropdownItem>
                          <DropdownItem onClick={() => handleDelete(item)}>
                            <DropdownLabel>{t('common.delete')}</DropdownLabel>
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                plain
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t('common.pagination.previous')}
              </Button>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('common.pagination.pageOf', { page: page + 1, total: totalPages })}
              </span>
              <Button
                plain
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.pagination.next')}
              </Button>
            </div>
          )}
        </div>
      )}

      <EquipmentFormDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelectedEquipment(null);
        }}
        equipment={selectedEquipment}
      />
    </AppLayout>
  );
}
