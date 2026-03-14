import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';

interface WorkOrder {
  id: string;
  customerId: string;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  notes?: string;
  totalAmount?: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS = {
  PENDING: 'amber',
  SCHEDULED: 'sky',
  IN_PROGRESS: 'blue',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
} as const;

const STATUS_LABELS = {
  PENDING: 'Pending',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  const { data: workOrders, isLoading, error } = useQuery({
    queryKey: ['work-orders'],
    queryFn: async () => {
      const response = await apiClient.get<WorkOrder[]>('/work-orders');
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/work-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });

  const handleAdd = () => {
    setSelectedWorkOrder(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsDialogOpen(true);
  };

  const handleDelete = (workOrder: WorkOrder) => {
    if (window.confirm('Are you sure you want to delete this work order?')) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedWorkOrder(null);
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <AppLayout>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <Heading>Work Orders</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Manage work orders and service requests
            </p>
          </div>
          <Button onClick={handleAdd}>Create Work Order</Button>
        </div>

        {isLoading && (
          <div className="mt-3 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">Loading work orders...</p>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-400">
              Error loading work orders: {(error as Error).message}
            </p>
          </div>
        )}

        {workOrders && workOrders.length === 0 && (
          <div className="mt-3 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">No work orders found</p>
            <Button className="mt-4" onClick={handleAdd}>
              Create your first work order
            </Button>
          </div>
        )}

        {workOrders && workOrders.length > 0 && (
          <div className="mt-3">
            <Table className="[--gutter:theme(spacing.2)] lg:[--gutter:theme(spacing.3)]">
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Scheduled</TableHeader>
                  <TableHeader>Amount</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader></TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {workOrders.map((workOrder) => (
                  <TableRow key={workOrder.id}>
                    <TableCell className="font-mono text-sm text-zinc-500">
                      {workOrder.id.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium">
                      {workOrder.customerId.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge color={STATUS_COLORS[workOrder.status]}>
                        {STATUS_LABELS[workOrder.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(workOrder.scheduledDate)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatCurrency(workOrder.totalAmount)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {workOrder.description
                        ? workOrder.description.substring(0, 50) + (workOrder.description.length > 50 ? '...' : '')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                        <Dropdown>
                          <DropdownButton plain aria-label="More options">
                            <EllipsisVerticalIcon className="size-5" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => handleEdit(workOrder)}>
                              <DropdownLabel>Edit</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDelete(workOrder)}>
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

      <WorkOrderFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        workOrder={selectedWorkOrder}
      />
    </AppLayout>
  );
}
