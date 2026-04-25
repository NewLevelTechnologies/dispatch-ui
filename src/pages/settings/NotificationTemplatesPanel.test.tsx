import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import NotificationTemplatesPanel from './NotificationTemplatesPanel';
import apiClient from '../../api/client';

vi.mock('../../api/client');

const mockTemplates = [
  {
    id: 'tpl-1',
    type: 'INVOICE_CREATED',
    displayName: 'Invoice Created',
    channel: 'EMAIL',
    subject: 'Your invoice is ready',
    isSystemTemplate: true,
    version: 1,
  },
  {
    id: 'tpl-2',
    type: 'WORK_ORDER_COMPLETED',
    displayName: 'Work Order Completed',
    channel: 'SMS',
    subject: null,
    isSystemTemplate: false,
    version: 3,
  },
];

describe('NotificationTemplatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { templates: mockTemplates } });
  });

  it('renders templates with channel and status', async () => {
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Invoice Created')).toBeInTheDocument();
    });
    expect(screen.getByText('Work Order Completed')).toBeInTheDocument();
    expect(screen.getByText('System Default')).toBeInTheDocument();
    expect(screen.getByText('Customized')).toBeInTheDocument();
    expect(screen.getByText(/your invoice is ready/i)).toBeInTheDocument();
  });

  it('shows Customize action for system templates and Edit + Revert for customized', async () => {
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => expect(screen.getByText('Invoice Created')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /^customize$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revert to default/i })).toBeInTheDocument();
  });

  it('renders empty state when no templates', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { templates: [] } });
    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no notification templates/i)).toBeInTheDocument();
    });
  });

  it('reverts a customized template after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => expect(screen.getByText('Work Order Completed')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /revert to default/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(expect.stringContaining('tpl-2'));
    });

    confirmSpy.mockRestore();
  });

  it('opens the editor when Customize is clicked (calls getById)', async () => {
    const user = userEvent.setup();
    const fullTemplate = {
      id: 'tpl-1',
      type: 'INVOICE_CREATED',
      displayName: 'Invoice Created',
      channel: 'EMAIL',
      subject: 'Your invoice is ready',
      bodyText: 'Hi {{customer_name}}',
      bodyHtml: null,
      variables: [],
      isSystemTemplate: true,
      version: 1,
    };
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/notification-templates/tpl-1')) {
        return Promise.resolve({ data: fullTemplate });
      }
      return Promise.resolve({ data: { templates: mockTemplates } });
    });

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => expect(screen.getByText('Invoice Created')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^customize$/i }));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/notification-templates/tpl-1');
    });
  });

  it('surfaces an alert when getById fails on customize', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/notification-templates/tpl-1')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({ data: { templates: mockTemplates } });
    });

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => expect(screen.getByText('Invoice Created')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^customize$/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('does not revert if user cancels confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => expect(screen.getByText('Work Order Completed')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /revert to default/i }));

    expect(apiClient.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('surfaces API error message on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Templates service down' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<NotificationTemplatesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Templates service down')).toBeInTheDocument();
    });
  });
});
