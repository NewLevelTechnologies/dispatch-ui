import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import NotificationTemplatesPanel from './NotificationTemplatesPanel';
import { apiClient } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

const mockTemplates = [
  {
    id: 'tpl-1',
    notificationTypeKey: 'invoice_sent',
    displayName: 'Invoice Sent',
    channel: 'EMAIL',
    audience: 'CUSTOMER',
    subject: 'Your invoice is ready',
    isSystemTemplate: true,
    hasHtmlBody: false,
    tenantId: null,
    version: 1,
    isActive: true,
  },
  {
    id: 'tpl-2',
    notificationTypeKey: 'work_order_completed',
    displayName: 'Work Order Completed',
    channel: 'SMS',
    audience: 'INTERNAL',
    subject: null,
    isSystemTemplate: false,
    hasHtmlBody: false,
    tenantId: 'tenant-1',
    version: 3,
    isActive: true,
  },
  // PUSH should be filtered out client-side — the stubbed FAILED channel.
  {
    id: 'tpl-3',
    notificationTypeKey: 'never_shown',
    displayName: 'Push Notification',
    channel: 'PUSH',
    audience: 'CUSTOMER',
    subject: null,
    isSystemTemplate: true,
    hasHtmlBody: false,
    tenantId: null,
    version: 1,
    isActive: true,
  },
];

describe('NotificationTemplatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateSpy.mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { templates: mockTemplates },
    });
  });

  it('renders templates with channel and status', async () => {
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument();
    });
    expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    expect(screen.getByText('System default')).toBeInTheDocument();
    expect(screen.getByText('Customized')).toBeInTheDocument();
    expect(screen.getByText(/your invoice is ready/i)).toBeInTheDocument();
    // Audience surfaces per row: tpl-1 CUSTOMER, tpl-2 INTERNAL.
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  it('filters PUSH templates out of the list', async () => {
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument();
    });
    expect(screen.queryByText('Push Notification')).not.toBeInTheDocument();
  });

  it('navigates to the edit page when a row is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );

    await user.click(screen.getByText('Invoice Sent'));

    expect(navigateSpy).toHaveBeenCalledWith('/settings/notifications/tpl-1');
  });

  it('shows the empty state when the catalog is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { templates: [] } });
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
    });
  });

  it('surfaces an error state on load failure with a retry action', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Templates service down' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Templates service down')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('surfaces the customized summary on the toolbar when overrides exist', async () => {
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      // 1 customized + 1 system default after PUSH filter
      expect(
        screen.getByText(/1 on system defaults/i)
      ).toBeInTheDocument();
    });
  });

  it('filters by channel and clears via the chip × button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );

    // Select EMAIL → only the EMAIL template remains (SMS row drops out).
    await user.click(screen.getByRole('button', { name: /^Channel$/i }));
    await user.click(screen.getByRole('option', { name: /^Email$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument();
      expect(screen.queryByText('Work Order Completed')).not.toBeInTheDocument();
    });

    // Clearing the chip restores the full list.
    await user.click(screen.getByRole('button', { name: /channel.*clear/i }));

    await waitFor(() =>
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument()
    );
  });

  it('filters by audience and clears via the chip × button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /^Audience$/i }));
    await user.click(screen.getByRole('option', { name: /^Customer$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument();
      expect(screen.queryByText('Work Order Completed')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /audience.*clear/i }));

    await waitFor(() =>
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument()
    );
  });

  it('filters by status (customized) and clears via the chip × button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );

    // "Customized" keeps the non-system template, drops the system default.
    await user.click(screen.getByRole('button', { name: /^Status$/i }));
    await user.click(screen.getByRole('option', { name: /^Customized$/i }));

    await waitFor(() => {
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
      expect(screen.queryByText('Invoice Sent')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /status.*clear/i }));

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );
  });

  it('filters the list by search text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );

    await user.type(screen.getByRole('textbox'), 'invoice');

    await waitFor(() => {
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument();
      expect(screen.queryByText('Work Order Completed')).not.toBeInTheDocument();
    });
  });

  it('refetches when the error-state retry is clicked', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Templates service down' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    const user = userEvent.setup();
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() =>
      expect(screen.getByText('Templates service down')).toBeInTheDocument()
    );

    // Recover on retry, then assert the list renders.
    vi.mocked(apiClient.get).mockResolvedValue({ data: { templates: mockTemplates } });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect(screen.getByText('Invoice Sent')).toBeInTheDocument()
    );
  });
});
