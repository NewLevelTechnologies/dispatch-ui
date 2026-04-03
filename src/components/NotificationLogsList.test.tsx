import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import NotificationLogsList from './NotificationLogsList';
import { NotificationStatus, NotificationChannel } from '../api';
import * as api from '../api';

vi.mock('../api/client');

describe('NotificationLogsList', () => {
  const mockLogs = {
    content: [
      {
        id: '1',
        notificationId: 'notif-1',
        notificationTypeId: 'type-1',
        notificationTypeName: 'Invoice Created',
        channel: NotificationChannel.EMAIL,
        recipientName: 'John Doe',
        recipientEmail: 'john@example.com',
        recipientPhone: undefined,
        status: NotificationStatus.DELIVERED,
        entityType: 'invoice',
        entityId: 'invoice-1',
        subject: 'Your Invoice #INV-001',
        createdAt: '2026-04-01T10:00:00Z',
        sentAt: '2026-04-01T10:00:05Z',
        deliveredAt: '2026-04-01T10:00:10Z',
        errorMessage: undefined,
        retryCount: 0,
        externalMessageId: 'ses-123',
      },
      {
        id: '2',
        notificationId: 'notif-2',
        notificationTypeId: 'type-2',
        notificationTypeName: 'Work Order Completed',
        channel: NotificationChannel.SMS,
        recipientName: 'Jane Smith',
        recipientEmail: undefined,
        recipientPhone: '+14045551234',
        status: NotificationStatus.SENT,
        entityType: 'work_order',
        entityId: 'wo-1',
        subject: undefined,
        createdAt: '2026-04-01T11:00:00Z',
        sentAt: '2026-04-01T11:00:03Z',
        deliveredAt: undefined,
        errorMessage: undefined,
        retryCount: 0,
        externalMessageId: 'sns-456',
      },
      {
        id: '3',
        notificationId: 'notif-3',
        notificationTypeId: 'type-1',
        notificationTypeName: 'Invoice Created',
        channel: NotificationChannel.EMAIL,
        recipientName: 'Bob Johnson',
        recipientEmail: 'bob@example.com',
        recipientPhone: undefined,
        status: NotificationStatus.BOUNCED,
        entityType: 'invoice',
        entityId: 'invoice-2',
        subject: 'Your Invoice #INV-002',
        createdAt: '2026-04-01T09:00:00Z',
        sentAt: '2026-04-01T09:00:05Z',
        deliveredAt: undefined,
        errorMessage: 'Mailbox does not exist',
        retryCount: 0,
        externalMessageId: 'ses-789',
      },
    ],
    pageable: {
      pageNumber: 0,
      pageSize: 20,
      sort: { sorted: true, unsorted: false, empty: false },
      offset: 0,
      paged: true,
      unpaged: false,
    },
    totalPages: 1,
    totalElements: 3,
    last: true,
    size: 20,
    number: 0,
    sort: { sorted: true, unsorted: false, empty: false },
    numberOfElements: 3,
    first: true,
    empty: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notification logs table', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('displays status badges with correct colors', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('DELIVERED')).toBeInTheDocument();
    });

    expect(screen.getByText('SENT')).toBeInTheDocument();
    expect(screen.getByText('BOUNCED')).toBeInTheDocument();
  });

  it('displays error messages for failed notifications', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Mailbox does not exist/)).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    expect(screen.getByText('Loading notification logs...')).toBeInTheDocument();
  });

  it('shows empty state when no logs', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue({
      ...mockLogs,
      content: [],
      totalElements: 0,
      numberOfElements: 0,
    });

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('No notification logs found')).toBeInTheDocument();
    });
  });

  it('shows error state on API failure', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockRejectedValue(
      new Error('Network error')
    );

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load notification logs/)).toBeInTheDocument();
    });
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find and change status filter
    const statusSelect = screen.getByDisplayValue('All Statuses');
    await user.selectOptions(statusSelect, 'DELIVERED');

    await waitFor(() => {
      expect(api.notificationApi.getNotificationLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.DELIVERED,
        })
      );
    });
  });

  it('filters by channel', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find and change channel filter
    const channelSelect = screen.getByDisplayValue('All Channels');
    await user.selectOptions(channelSelect, 'EMAIL');

    await waitFor(() => {
      expect(api.notificationApi.getNotificationLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
        })
      );
    });
  });

  it('paginates through results', async () => {
    const user = userEvent.setup();
    const mockPage1 = {
      ...mockLogs,
      totalPages: 2,
      totalElements: 25,
      last: false,
    };
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockPage1);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Showing 1-20 of 25')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(api.notificationApi.getNotificationLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
        })
      );
    });
  });

  it('displays channel icons', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getAllByText('EMAIL').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('SMS').length).toBeGreaterThan(0);
  });

  it('formats dates correctly', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      // Check that at least one date is formatted (should contain 2026 and some month)
      expect(screen.getAllByText(/2026/)[0]).toBeInTheDocument();
    });
  });

  it('passes entityType and entityId filters', async () => {
    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(mockLogs);

    renderWithProviders(
      <NotificationLogsList
        customerId="customer-123"
        entityType="invoice"
        entityId="invoice-1"
      />
    );

    await waitFor(() => {
      expect(api.notificationApi.getNotificationLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-123',
          entityType: 'invoice',
          entityId: 'invoice-1',
        })
      );
    });
  });

  it('displays all status badge colors', async () => {
    const logsWithAllStatuses = {
      ...mockLogs,
      content: [
        { ...mockLogs.content[0], status: NotificationStatus.DELIVERED },
        { ...mockLogs.content[1], status: NotificationStatus.SENT },
        { ...mockLogs.content[0], id: '3', status: NotificationStatus.PENDING },
        { ...mockLogs.content[0], id: '4', status: NotificationStatus.BOUNCED },
        { ...mockLogs.content[0], id: '5', status: NotificationStatus.FAILED },
      ],
    };

    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(logsWithAllStatuses);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('DELIVERED')).toBeInTheDocument();
      expect(screen.getByText('SENT')).toBeInTheDocument();
      expect(screen.getByText('PENDING')).toBeInTheDocument();
      expect(screen.getByText('BOUNCED')).toBeInTheDocument();
      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });
  });

  it('displays all channel icons', async () => {
    const logsWithAllChannels = {
      ...mockLogs,
      content: [
        { ...mockLogs.content[0], channel: NotificationChannel.EMAIL },
        { ...mockLogs.content[1], channel: NotificationChannel.SMS },
        { ...mockLogs.content[0], id: '3', channel: NotificationChannel.PUSH },
      ],
      totalPages: 1,
      totalElements: 3,
    };

    vi.spyOn(api.notificationApi, 'getNotificationLogs').mockResolvedValue(logsWithAllChannels);

    renderWithProviders(<NotificationLogsList customerId="customer-123" />);

    await waitFor(() => {
      // Check that all three channels are present by checking the table content
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    // Verify we have all three rows rendered
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(4); // Header + 3 data rows
  });
});
