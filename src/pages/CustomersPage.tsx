import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { customerApi, type Customer } from '../api';
import AppLayout from '../components/AppLayout';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input } from '../components/catalyst/input';

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerApi.getAll(),
  });

  // Filter customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!searchQuery.trim()) return customers;

    const query = searchQuery.toLowerCase();
    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query) ||
        customer.city?.toLowerCase().includes(query) ||
        customer.state?.toLowerCase().includes(query)
    );
    console.log('Search query:', searchQuery, '| Total:', customers.length, '| Filtered:', filtered.length);
    return filtered;
  }, [customers, searchQuery]);

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
        <Heading>{t('entities.customers')}</Heading>
        <Button onClick={handleAdd}>{t('common.actions.add', { entity: t('entities.customer') })}</Button>
      </div>

      {/* Quick Search Bar */}
      <div className="mt-2 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {customers && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredCustomers.length === customers.length
              ? `${customers.length} ${customers.length === 1 ? t('entities.customer').toLowerCase() : t('entities.customers').toLowerCase()}`
              : `${filteredCustomers.length} of ${customers.length}`}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: t('entities.customers') })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('entities.customers') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {customers && customers.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.notFound', { entities: t('entities.customers') })}</p>
          <Button className="mt-2" onClick={handleAdd}>
            {t('common.actions.addFirst', { entity: t('entities.customer') })}
          </Button>
        </div>
      )}

      {filteredCustomers.length === 0 && customers && customers.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.noMatchSearch', { entities: t('entities.customers') })}</p>
        </div>
      )}

      {filteredCustomers.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.email')}</TableHeader>
                <TableHeader>{t('common.form.phone')}</TableHeader>
                <TableHeader>{t('customers.table.location')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="text-zinc-500">{customer.email}</TableCell>
                  <TableCell className="text-zinc-500">{customer.phone || '-'}</TableCell>
                  <TableCell className="text-zinc-500">
                    {customer.city && customer.state
                      ? `${customer.city}, ${customer.state}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge color="lime">{t('common.active')}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                      <Dropdown>
                        <DropdownButton plain aria-label={t('common.moreOptions')}>
                          <EllipsisVerticalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => handleEdit(customer)}>
                            <DropdownLabel>{t('common.edit')}</DropdownLabel>
                          </DropdownItem>
                          <DropdownItem onClick={() => handleDelete(customer)}>
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
        </div>
      )}

      <CustomerFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        customer={selectedCustomer}
      />
    </AppLayout>
  );
}
