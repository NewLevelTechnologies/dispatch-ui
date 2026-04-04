import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import NotificationTemplateEditor from './NotificationTemplateEditor';
import { notificationTemplateApi } from '../api';

vi.mock('../api/notificationTemplateApi');

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const mockTemplate = {
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

const mockSmsTemplate = {
  ...mockTemplate,
  id: '2',
  channel: 'SMS' as const,
  htmlBodyTemplate: null,
  hasHtmlBody: false,
};

const mockVersionHistory = {
  notificationTypeKey: 'WORK_ORDER_SCHEDULED',
  displayName: 'Work Order Scheduled',
  channel: 'EMAIL' as const,
  versions: [
    {
      id: 'v1',
      version: 1,
      isActive: true,
      subject: 'Your service has been scheduled',
      bodyTemplate: 'Hello {{customerName}}',
      htmlBodyTemplate: '<p>Hello {{customerName}}</p>',
      updatedAt: '2024-01-02T10:00:00Z',
      updatedByName: 'Admin User',
    },
    {
      id: 'v2',
      version: 2,
      isActive: false,
      subject: 'Service Scheduled',
      bodyTemplate: 'Hi {{customerName}}',
      htmlBodyTemplate: '<p>Hi {{customerName}}</p>',
      updatedAt: '2024-01-01T08:00:00Z',
      updatedByName: 'Other User',
    },
  ],
};

const mockPreviewResult = {
  subject: 'Your service has been scheduled',
  bodyPlainText: 'Hello John Doe, your service is scheduled for 2024-03-15.',
  bodyHtml: '<p>Hello John Doe, your service is scheduled for 2024-03-15.</p>',
  missingVariables: [],
  warnings: [],
};

describe('NotificationTemplateEditor', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor with template information', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/EMAIL notification template/i)).toBeInTheDocument();
    expect(screen.getByText(/System Default/i)).toBeInTheDocument();
  });

  it('displays customized badge for tenant templates', () => {
    const customizedTemplate = { ...mockTemplate, isSystemTemplate: false, version: 3, tenantId: 'tenant-1' };

    renderWithProviders(
      <NotificationTemplateEditor template={customizedTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByText(/Customized \(v3\)/i)).toBeInTheDocument();
  });

  it('displays Edit, Preview, and History tabs', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByRole('tab', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /preview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
  });

  it('displays subject and body template fields in edit tab', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter subject line/i)).toBeInTheDocument();
  });

  it('shows Plain Text and HTML tabs for email templates', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByRole('tab', { name: /plain text/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /html/i })).toBeInTheDocument();
  });

  it('only shows Plain Text tab for SMS templates', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockSmsTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByRole('tab', { name: /plain text/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /html/i })).not.toBeInTheDocument();
  });

  it('displays available variables panel', () => {
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    expect(screen.getByText('Available Variables')).toBeInTheDocument();
  });

  it('expands and collapses variables panel', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const variablesButton = screen.getByText('Available Variables').closest('button');
    expect(variablesButton).toBeInTheDocument();

    // Panel should be collapsed initially
    expect(screen.queryByText('Customer name')).not.toBeInTheDocument();

    // Expand panel
    await user.click(variablesButton!);
    expect(screen.getByText('Customer name')).toBeInTheDocument();
    expect(screen.getByText('Scheduled date')).toBeInTheDocument();

    // Collapse panel
    await user.click(variablesButton!);
    await waitFor(() => {
      expect(screen.queryByText('Customer name')).not.toBeInTheDocument();
    });
  });

  it('displays required badge for required variables', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const variablesButton = screen.getByText('Available Variables').closest('button');
    await user.click(variablesButton!);

    const requiredBadges = screen.getAllByText('Required');
    expect(requiredBadges.length).toBeGreaterThan(0);
  });

  it('allows editing subject field', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const subjectInput = screen.getByLabelText(/subject/i) as HTMLInputElement;
    expect(subjectInput.value).toBe('Your service has been scheduled');

    await user.clear(subjectInput);
    await user.type(subjectInput, 'New Subject');

    expect(subjectInput.value).toBe('New Subject');
  });

  it('saves template changes', async () => {
    vi.mocked(notificationTemplateApi.update).mockResolvedValue(mockTemplate);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const subjectInput = screen.getByLabelText(/subject/i);
    await user.clear(subjectInput);
    await user.type(subjectInput, 'Updated Subject');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(notificationTemplateApi.update).toHaveBeenCalledWith('1', {
        subject: 'Updated Subject',
        bodyTemplate: mockTemplate.bodyTemplate,
        htmlBodyTemplate: mockTemplate.htmlBodyTemplate,
      });
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('displays saving state while saving', async () => {
    vi.mocked(notificationTemplateApi.update).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('handles save error', async () => {
    vi.mocked(notificationTemplateApi.update).mockRejectedValue(new Error('Save failed'));
    const alertSpy = vi.spyOn(window, 'alert');
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to update template');
    });

    alertSpy.mockRestore();
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('switches to preview tab and auto-generates preview', async () => {
    vi.mocked(notificationTemplateApi.preview).mockResolvedValue(mockPreviewResult);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    await waitFor(() => {
      expect(notificationTemplateApi.preview).toHaveBeenCalled();
    });
  });

  it('displays preview result in preview tab', async () => {
    vi.mocked(notificationTemplateApi.preview).mockResolvedValue(mockPreviewResult);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    await waitFor(() => {
      expect(screen.getByText('Your service has been scheduled')).toBeInTheDocument();
    });

    expect(screen.getByText('Hello John Doe, your service is scheduled for 2024-03-15.')).toBeInTheDocument();
  });

  it('displays missing variables warning in preview', async () => {
    const previewWithMissing = {
      ...mockPreviewResult,
      missingVariables: ['customerEmail'],
    };
    vi.mocked(notificationTemplateApi.preview).mockResolvedValue(previewWithMissing);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    await waitFor(() => {
      expect(screen.getByText(/missing variables/i)).toBeInTheDocument();
    });

    expect(screen.getByText('customerEmail')).toBeInTheDocument();
  });

  it('displays warnings in preview', async () => {
    const previewWithWarnings = {
      ...mockPreviewResult,
      warnings: ['Subject is empty', 'Body is too short'],
    };
    vi.mocked(notificationTemplateApi.preview).mockResolvedValue(previewWithWarnings);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    await waitFor(() => {
      expect(screen.getByText(/warnings/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Subject is empty')).toBeInTheDocument();
    expect(screen.getByText('Body is too short')).toBeInTheDocument();
  });

  it('allows regenerating preview with different data', async () => {
    vi.mocked(notificationTemplateApi.preview).mockResolvedValue(mockPreviewResult);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate preview/i })).toBeInTheDocument();
    });

    const regenerateButton = screen.getByRole('button', { name: /regenerate preview/i });
    await user.click(regenerateButton);

    await waitFor(() => {
      expect(notificationTemplateApi.preview).toHaveBeenCalledTimes(2);
    });
  });

  it('fetches version history when history tab is clicked', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(notificationTemplateApi.getVersionHistory).toHaveBeenCalledWith('1');
    });
  });

  it('displays version history in history tab', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText(/Admin User/i)).toBeInTheDocument();
    expect(screen.getByText(/Other User/i)).toBeInTheDocument();
  });

  it('displays current badge for active version', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  it('shows rollback button for non-active versions', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });

    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    expect(rollbackButtons.length).toBe(1); // Only one non-active version
  });

  it('confirms and rolls back to previous version', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    vi.mocked(notificationTemplateApi.rollback).mockResolvedValue(mockTemplate);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });

    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    await user.click(rollbackButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('version 2')
    );

    await waitFor(() => {
      expect(notificationTemplateApi.rollback).toHaveBeenCalledWith('1', 'v2');
    });

    expect(mockOnClose).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('does not rollback when user cancels confirmation', async () => {
    vi.mocked(notificationTemplateApi.getVersionHistory).mockResolvedValue(mockVersionHistory);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });

    const rollbackButton = screen.getByRole('button', { name: /rollback/i });
    await user.click(rollbackButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(notificationTemplateApi.rollback).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('toggles HTML preview visibility', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    // Switch to HTML tab
    const htmlTab = screen.getByRole('tab', { name: /html/i });
    await user.click(htmlTab);

    // Find and click the toggle button
    const toggleButton = screen.getByRole('button', { name: /show preview/i });
    await user.click(toggleButton);

    // Button text should change
    expect(screen.getByRole('button', { name: /hide preview/i })).toBeInTheDocument();

    // Click again to hide
    await user.click(screen.getByRole('button', { name: /hide preview/i }));
    expect(screen.getByRole('button', { name: /show preview/i })).toBeInTheDocument();
  });

  it('resets form when template changes', async () => {
    const { rerender } = renderWithProviders(
      <NotificationTemplateEditor template={mockTemplate} isOpen={true} onClose={mockOnClose} />
    );

    let subjectInput = screen.getByLabelText(/subject/i) as HTMLInputElement;
    expect(subjectInput.value).toBe('Your service has been scheduled');

    const newTemplate = { ...mockTemplate, subject: 'Different Subject' };

    rerender(
      <NotificationTemplateEditor template={newTemplate} isOpen={true} onClose={mockOnClose} />
    );

    // Re-query for the input after rerender
    await waitFor(() => {
      subjectInput = screen.getByLabelText(/subject/i) as HTMLInputElement;
      expect(subjectInput.value).toBe('Different Subject');
    });
  });
});
