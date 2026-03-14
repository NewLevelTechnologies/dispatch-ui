import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/customers/${id}`),
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
    if (window.confirm(`Are you sure you want to delete ${customer.name}?`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedCustomer(null);
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between">
          <div>
            <Heading>Customers</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Manage your customer database
            </p>
          </div>
          <Button onClick={handleAdd}>Add Customer</Button>
        </div>

        {isLoading && (
          <div className="mt-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">Loading customers...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-400">
              Error loading customers: {(error as Error).message}
            </p>
          </div>
        )}

        {customers && customers.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">No customers found</p>
            <Button className="mt-4" onClick={handleAdd}>
              Add your first customer
            </Button>
          </div>
        )}

        {customers && customers.length > 0 && (
          <div className="mt-8">
            <Table className="[--gutter:theme(spacing.6)] lg:[--gutter:theme(spacing.10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Phone</TableHeader>
                  <TableHeader>Location</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader></TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((customer) => (
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
                      <Badge color="lime">Active</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                        <Dropdown>
                          <DropdownButton plain aria-label="More options">
                            <EllipsisVerticalIcon className="size-5" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => handleEdit(customer)}>
                              <DropdownLabel>Edit</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDelete(customer)}>
                              <DropdownLabel>Delete</DropdownLabel>
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
      </div>

      <CustomerFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        customer={selectedCustomer}
      />
    </AppLayout>
  );
}
