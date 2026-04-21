import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import NotificationPreferencesDialog from './NotificationPreferencesDialog';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('NotificationPreferencesDialog', () => {
  const mockCustomerId = 'customer-1';
  const mockContactName = 'John Doe';

  const mockPreferences = [
    {
      id: 'pref-1',
      customerId: mockCustomerId,
      contactId: null,
      notificationTypeId: 'type-1',
      notificationTypeKey: 'work_order_scheduled',
      notificationTypeName: 'Work Order Scheduled',
      channel: 'EMAIL' as const,
      optIn: true,
    },
    {
      id: 'pref-2',
      customerId: mockCustomerId,
      contactId: null,
      notificationTypeId: 'type-1',
      notificationTypeKey: 'work_order_scheduled',
      notificationTypeName: 'Work Order Scheduled',
      channel: 'SMS' as const,
      optIn: false,
    },
    {
      id: 'pref-3',
      customerId: mockCustomerId,
      contactId: null,
      notificationTypeId: 'type-2',
      notificationTypeKey: 'invoice_ready',
      notificationTypeName: 'Invoice Ready',
      channel: 'EMAIL' as const,
      optIn: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  });

  it('renders dialog with title and description', async () => {
    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Manage notification preferences for John Doe/i)).toBeInTheDocument();
    });
  });

  it('displays loading state while fetching preferences', () => {
    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays preferences in table after loading', async () => {
    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      expect(screen.getByText('Invoice Ready')).toBeInTheDocument();
    });
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to fetch'));

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load notification preferences')).toBeInTheDocument();
    });
  });

  it('displays empty state when no preferences available', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No notification preferences available')).toBeInTheDocument();
    });
  });

  it('toggles preference when checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    const emailCheckbox = checkboxes[0]; // First checkbox (EMAIL for Work Order Scheduled)

    await user.click(emailCheckbox);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/notification-preferences/pref-1',
        { optIn: false }
      );
    });
  });

  it('closes dialog when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={onClose}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('creates new preference when toggling uncreated preference', async () => {
    const user = userEvent.setup();

    const preferencesWithNull = [
      {
        id: null, // No preference created yet
        customerId: mockCustomerId,
        contactId: null,
        notificationTypeId: 'type-1',
        notificationTypeKey: 'work_order_scheduled',
        notificationTypeName: 'Work Order Scheduled',
        channel: 'PUSH' as const,
        optIn: false,
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValue({ data: preferencesWithNull });

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contactName={mockContactName}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/notification-preferences',
        expect.objectContaining({
          customerId: mockCustomerId,
          contactId: null,
          notificationTypeId: 'type-1',
          optIn: true,
        })
      );
    });
  });

  it('fetches contact preferences when contactId provided', async () => {
    const mockContact = {
      id: 'contact-1',
      name: 'Jane Smith',
      phone: '555-1234',
      email: 'jane@test.com',
      notes: null,
      displayOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    renderWithProviders(
      <NotificationPreferencesDialog
        isOpen={true}
        onClose={vi.fn()}
        customerId={mockCustomerId}
        contact={mockContact}
        contactName={mockContact.name}
      />
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        `/notification-preferences/customers/${mockCustomerId}/contacts/${mockContact.id}`
      );
    });
  });
});
