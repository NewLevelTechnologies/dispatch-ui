import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AdditionalContactsList from './AdditionalContactsList';
import apiClient from '../api/client';
import type { AdditionalContact } from '../api';

vi.mock('../api/client');

const mockContacts: AdditionalContact[] = [
  {
    id: 'contact-1',
    name: 'Jane Smith',
    phone: '5551234567',
    email: 'jane@example.com',
    notes: 'Primary contact',
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'contact-2',
    name: 'Bob Johnson',
    phone: '5559876543',
    email: null,
    notes: null,
    displayOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('AdditionalContactsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays list of contacts', () => {
    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText(/\(555\) 123-4567/i)).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
  });

  it('displays empty state when no contacts', () => {
    renderWithProviders(
      <AdditionalContactsList
        contacts={[]}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    expect(screen.getByText(/no additional contacts yet/i)).toBeInTheDocument();
  });

  it('hides when no contacts and showAddButton is false', () => {
    const { container } = renderWithProviders(
      <AdditionalContactsList
        contacts={[]}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows add button when canEdit is true', () => {
    renderWithProviders(
      <AdditionalContactsList
        contacts={[]}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  it('hides add button when canEdit is false', () => {
    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={false}
        showAddButton={true}
      />
    );

    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('opens add dialog when add button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactsList
        contacts={[]}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const addButton = screen.getByRole('button', { name: /add/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/create additional contact/i)).toBeInTheDocument();
    });
  });

  it('opens edit dialog when edit button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const editButtons = screen.getAllByTitle(/edit/i);
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/edit additional contact/i)).toBeInTheDocument();
    });
  });

  it('opens delete confirmation when delete button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const deleteButtons = screen.getAllByTitle(/delete/i);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete additional contact/i)).toBeInTheDocument();
    });
  });

  it('deletes contact when confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const deleteButtons = screen.getAllByTitle(/delete/i);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete additional contact/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /delete/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/customers/parent-1/contacts/contact-1');
    });
  });

  it('uses service location endpoint for serviceLocation parentType', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="loc-1"
        parentType="serviceLocation"
        customerId="customer-1"
        queryKey={['customers']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const deleteButtons = screen.getAllByTitle(/delete/i);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete additional contact/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /delete/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/service-locations/loc-1/contacts/contact-1');
    });
  });

  it('displays contact without email', () => {
    const contactsWithoutEmail: AdditionalContact[] = [
      {
        ...mockContacts[0],
        email: null,
      },
    ];

    renderWithProviders(
      <AdditionalContactsList
        contacts={contactsWithoutEmail}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText(/\(555\) 123-4567/i)).toBeInTheDocument();
  });

  it('displays contact without phone', () => {
    const contactsWithoutPhone: AdditionalContact[] = [
      {
        ...mockContacts[0],
        phone: null,
      },
    ];

    renderWithProviders(
      <AdditionalContactsList
        contacts={contactsWithoutPhone}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('opens notification preferences dialog when manage notifications button clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const notificationButtons = screen.getAllByTitle(/manage notifications/i);
    await user.click(notificationButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /notification preferences/i })).toBeInTheDocument();
    });
  });

  it('cancels delete when cancel button clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={true}
        showAddButton={true}
      />
    );

    const deleteButtons = screen.getAllByTitle(/delete/i);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete additional contact/i)).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText(/delete additional contact/i)).not.toBeInTheDocument();
    });

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('hides action buttons when canEdit is false', () => {
    renderWithProviders(
      <AdditionalContactsList
        contacts={mockContacts}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
        canEdit={false}
        showAddButton={false}
      />
    );

    expect(screen.queryByTitle(/edit/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/delete/i)).not.toBeInTheDocument();
  });
});
