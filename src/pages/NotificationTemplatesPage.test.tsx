import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import NotificationTemplatesPage from './NotificationTemplatesPage';
import { notificationTemplateApi } from '../api';

vi.mock('../api/notificationTemplateApi');

const mockTemplates = [
  {
    id: '1',
    notificationTypeKey: 'WORK_ORDER_SCHEDULED',
    displayName: 'Work Order Scheduled',
    channel: 'EMAIL' as const,
    tenantId: null,
    isSystemTemplate: true,
    subject: 'Your service has been scheduled',
    hasHtmlBody: true,
    version: 1,
    isActive: true,
  },
  {
    id: '2',
    notificationTypeKey: 'WORK_ORDER_COMPLETED',
    displayName: 'Work Order Completed',
    channel: 'SMS' as const,
    tenantId: 'tenant-1',
    isSystemTemplate: false,
    subject: null,
    hasHtmlBody: false,
    version: 2,
    isActive: true,
  },
];

const mockFullTemplate = {
  id: '1',
  notificationTypeKey: 'WORK_ORDER_SCHEDULED',
  displayName: 'Work Order Scheduled',
  channel: 'EMAIL' as const,
  tenantId: null,
  isSystemTemplate: true,
  subject: 'Your service has been scheduled',
  bodyTemplate: 'Hello {{customerName}}, your service is scheduled for {{scheduledDate}}.',
  htmlBodyTemplate: '<p>Hello {{customerName}}, your service is scheduled for {{scheduledDate}}.</p>',
  hasHtmlBody: true,
  version: 1,
  isActive: true,
  availableVariables: [
    {
      name: 'customerName',
      description: 'Customer name',
      required: true,
      exampleValue: 'John Doe',
    },
    {
      name: 'scheduledDate',
      description: 'Scheduled date',
      required: true,
      exampleValue: '2024-03-15',
    },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  updatedByName: 'Admin User',
};

describe('NotificationTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and description', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([]);

    renderWithProviders(<NotificationTemplatesPage />);

    expect(screen.getByRole('heading', { name: /notification templates/i })).toBeInTheDocument();
    expect(screen.getByText(/customize email and sms notification templates/i)).toBeInTheDocument();
  });

  it('displays loading state', () => {
    vi.mocked(notificationTemplateApi.getAll).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<NotificationTemplatesPage />);

    expect(screen.getByText(/loading templates/i)).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load notification templates/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([]);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no notification templates found/i)).toBeInTheDocument();
    });
  });

  it('displays templates in a table', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue(mockTemplates);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    expect(screen.getByText('Your service has been scheduled')).toBeInTheDocument();
  });

  it('displays correct badges for system and customized templates', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue(mockTemplates);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    expect(screen.getByText('System Default')).toBeInTheDocument();
    expect(screen.getByText('Customized')).toBeInTheDocument();
  });

  it('displays channel icons and labels correctly', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue(mockTemplates);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    // Check for Email and SMS channel text
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('shows customize button for system templates when user has edit capability', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[0]]);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
  });

  it('shows edit and revert buttons for customized templates when user has edit capability', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[1]]);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revert to default/i })).toBeInTheDocument();
  });

  it('opens editor when customize button is clicked', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[0]]);
    vi.mocked(notificationTemplateApi.getById).mockResolvedValue(mockFullTemplate);
    const user = userEvent.setup();

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    const customizeButton = screen.getByRole('button', { name: /customize/i });
    await user.click(customizeButton);

    await waitFor(() => {
      expect(notificationTemplateApi.getById).toHaveBeenCalledWith('1');
    });
  });

  it('confirms and reverts customized template to default', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[1]]);
    vi.mocked(notificationTemplateApi.delete).mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    });

    const revertButton = screen.getByRole('button', { name: /revert to default/i });
    await user.click(revertButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Work Order Completed')
    );

    await waitFor(() => {
      expect(notificationTemplateApi.delete).toHaveBeenCalledWith('2');
    });

    confirmSpy.mockRestore();
  });

  it('does not revert when user cancels confirmation', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[1]]);
    vi.mocked(notificationTemplateApi.delete).mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    });

    const revertButton = screen.getByRole('button', { name: /revert to default/i });
    await user.click(revertButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(notificationTemplateApi.delete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('displays template count', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue(mockTemplates);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    expect(screen.getByText(/showing 2 templates/i)).toBeInTheDocument();
  });

  it('displays version numbers', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue(mockTemplates);

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('handles error when loading template details', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[0]]);
    vi.mocked(notificationTemplateApi.getById).mockRejectedValue(new Error('Failed to load'));
    const alertSpy = vi.spyOn(window, 'alert');
    const user = userEvent.setup();

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    });

    const customizeButton = screen.getByRole('button', { name: /customize/i });
    await user.click(customizeButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to load template details');
    });

    alertSpy.mockRestore();
  });

  it('handles error when reverting template', async () => {
    vi.mocked(notificationTemplateApi.getAll).mockResolvedValue([mockTemplates[1]]);
    vi.mocked(notificationTemplateApi.delete).mockRejectedValue(new Error('Revert failed'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert');
    const user = userEvent.setup();

    renderWithProviders(<NotificationTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    });

    const revertButton = screen.getByRole('button', { name: /revert to default/i });
    await user.click(revertButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to revert template to default');
    });

    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
