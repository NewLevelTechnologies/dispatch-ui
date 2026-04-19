import { useState, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon, HomeIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { customerApi, type Customer } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { formatPhone } from '../utils/formatPhone';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';
import { Pagination, PaginationGap, PaginationList, PaginationNext, PaginationPage, PaginationPrevious } from '../components/catalyst/pagination';

export default function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const deferredSearch = useDeferredValue(searchQuery);

  // Read filters from URL
  const page = parseInt(searchParams.get('page') || '1', 10);
  const statusFilter = searchParams.get('status') || 'all';

  // Permission checks
  const canAddCustomers = useHasCapability('ADD_CUSTOMERS');
  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const canArchiveCustomers = useHasCapability('ARCHIVE_CUSTOMERS');

  // Update URL when search/filter changes
  const updateFilters = (updates: { search?: string; status?: string; page?: number }) => {
    const newParams = new URLSearchParams(searchParams);
    if (updates.search !== undefined) {
      if (updates.search) {
        newParams.set('search', updates.search);
      } else {
        newParams.delete('search');
      }
      newParams.set('page', '1'); // Reset to page 1 on filter change
    }
    if (updates.status !== undefined) {
      if (updates.status === 'all') {
        newParams.delete('status');
      } else {
        newParams.set('status', updates.status);
      }
      newParams.set('page', '1'); // Reset to page 1 on filter change
    }
    if (updates.page !== undefined) {
      newParams.set('page', updates.page.toString());
    }
    setSearchParams(newParams);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', page, statusFilter, deferredSearch],
    queryFn: () => customerApi.getAllPaginated({
      page,
      limit: 50,
      status: statusFilter === 'all' ? undefined : (statusFilter as 'ACTIVE' | 'INACTIVE'),
      search: deferredSearch || undefined,
    }),
  });

  const customers = data?.content || [];
  const totalCustomers = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const handleAdd = () => {
    setSelectedCustomer(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: customer.name }))) {
      deleteMutation.mutate(customer.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedCustomer(null);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('customer', true)}</Heading>
        {canAddCustomers && (
          <Button onClick={handleAdd}>{t('common.actions.add', { entity: getName('customer') })}</Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              updateFilters({ search: e.target.value });
            }}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Button
            plain
            onClick={() => updateFilters({ status: 'all' })}
            className={statusFilter === 'all' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('customers.filter.allStatuses')}
          </Button>
          <Button
            plain
            onClick={() => updateFilters({ status: 'ACTIVE' })}
            className={statusFilter === 'ACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('common.active')}
          </Button>
          <Button
            plain
            onClick={() => updateFilters({ status: 'INACTIVE' })}
            className={statusFilter === 'INACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('common.inactive')}
          </Button>
        </div>
        {totalCustomers > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {totalCustomers} {totalCustomers === 1 ? getName('customer').toLowerCase() : getName('customer', true).toLowerCase()}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: getName('customer', true) })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('customer', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {totalCustomers === 0 && !isLoading && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {deferredSearch || statusFilter !== 'all'
              ? t('common.actions.noMatchSearch', { entities: getName('customer', true) })
              : t('common.actions.notFound', { entities: getName('customer', true) })}
          </p>
          {canAddCustomers && !deferredSearch && statusFilter === 'all' && (
            <Button className="mt-2" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: getName('customer') })}
            </Button>
          )}
        </div>
      )}

      {customers.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('customers.table.type')}</TableHeader>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.phone')}</TableHeader>
                <TableHeader>{t('common.form.email')}</TableHeader>
                <TableHeader>{t('customers.table.billingAddress')}</TableHeader>
                <TableHeader>{t('customers.table.locations')}</TableHeader>
                <TableHeader>{t('customers.table.terms')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => {
                // Build payment terms badges
                const terms = [];
                if (customer.paymentTermsDays > 0) {
                  terms.push(`Net-${customer.paymentTermsDays}`);
                }
                if (customer.requiresPurchaseOrder) {
                  terms.push('PO');
                }
                if (customer.contractPricingTier) {
                  terms.push(customer.contractPricingTier);
                }

                return (
                  <TableRow key={customer.id} href={`/customers/${customer.id}`} className="cursor-pointer">
                    <TableCell>
                      {customer.displayMode === 'SIMPLE' ? (
                        <HomeIcon className="h-4 w-4 text-zinc-400" title="Homeowner" />
                      ) : (
                        <BuildingOfficeIcon className="h-4 w-4 text-zinc-400" title="Business" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-zinc-500">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="relative z-10 hover:underline"
                        >
                          {formatPhone(customer.phone)}
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <a
                        href={`mailto:${customer.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="relative z-10 hover:underline"
                      >
                        {customer.email}
                      </a>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <div className="text-xs">
                        {customer.billingAddress.streetAddress}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {customer.billingAddress.city}, {customer.billingAddress.state} {customer.billingAddress.zipCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {customer.serviceLocationCount > 0 ? (
                        <div className="text-xs">
                          {t('customers.table.locationsCount', { count: customer.serviceLocationCount })}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-400">{t('customers.table.none')}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {terms.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {terms.map((term, idx) => (
                            <Badge key={idx} color="zinc" className="text-xs">
                              {term}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge color={customer.status === 'ACTIVE' ? 'lime' : 'zinc'} className="text-xs">
                        {customer.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(canEditCustomers || canArchiveCustomers) && (
                        <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                          <Dropdown>
                            <DropdownButton plain aria-label={t('common.moreOptions')}>
                              <EllipsisVerticalIcon className="size-5" />
                            </DropdownButton>
                            <DropdownMenu anchor="bottom end">
                              <DropdownItem onClick={() => navigate(`/customers/${customer.id}`)}>
                                <DropdownLabel>{t('common.view')}</DropdownLabel>
                              </DropdownItem>
                              {canEditCustomers && (
                                <DropdownItem
                                  onClick={async () => {
                                    // Fetch full customer details for editing
                                    const fullCustomer = await customerApi.getById(customer.id);
                                    handleEdit(fullCustomer);
                                  }}
                                >
                                  <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                </DropdownItem>
                              )}
                              {canArchiveCustomers && (
                                <DropdownItem
                                  onClick={async () => {
                                    // Fetch full customer details for confirmation
                                    const fullCustomer = await customerApi.getById(customer.id);
                                    handleDelete(fullCustomer);
                                  }}
                                >
                                  <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                </DropdownItem>
                              )}
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationPrevious href={page > 1 ? `?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: (page - 1).toString() })}` : undefined} />
          <PaginationList>
            {(() => {
              const pages: (number | 'gap')[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push('gap');
                const start = Math.max(2, page - 1);
                const end = Math.min(totalPages - 1, page + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                if (page < totalPages - 2) pages.push('gap');
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === 'gap' ? (
                  <PaginationGap key={`gap-${idx}`} />
                ) : (
                  <PaginationPage
                    key={p}
                    href={`?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: p.toString() })}`}
                    current={p === page}
                  >
                    {p}
                  </PaginationPage>
                )
              );
            })()}
          </PaginationList>
          <PaginationNext href={page < totalPages ? `?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: (page + 1).toString() })}` : undefined} />
        </Pagination>
      )}

      <CustomerFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        customer={selectedCustomer}
      />
    </AppLayout>
  );
}
