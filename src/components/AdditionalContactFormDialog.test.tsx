import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AdditionalContactFormDialog from './AdditionalContactFormDialog';
import apiClient from '../api/client';
import type { AdditionalContact } from '../api';

vi.mock('../api/client');

const mockContact: AdditionalContact = {
  id: 'contact-1',
  name: 'Jane Smith',
  phone: '5551234567',
  email: 'jane@example.com',
  notes: 'Primary contact',
  displayOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('AdditionalContactFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock notification preferences API to return empty array by default
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  it('renders in create mode when no contact provided', () => {
    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    expect(screen.getByText(/create additional contact/i)).toBeInTheDocument();
  });

  it('renders in edit mode when contact provided', () => {
    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        contact={mockContact}
        queryKey={['customers', 'parent-1']}
      />
    );

    expect(screen.getByText(/edit additional contact/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Jane Smith')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Primary contact')).toBeInTheDocument();
  });

  it('validates required name field', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    // Form should not submit without name
    await waitFor(() => {
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    const emailInput = screen.getByLabelText(/email/i);

    await user.type(nameInput, 'Jane Smith');
    await user.type(emailInput, 'invalid-email');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    // Form should not submit with invalid email
    await waitFor(() => {
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });

  it('creates contact with valid data', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockContact });

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={onClose}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    const phoneInput = screen.getByLabelText(/phone/i);
    const emailInput = screen.getByLabelText(/email/i);
    const notesInput = screen.getByLabelText(/notes/i);

    await user.type(nameInput, 'Jane Smith');
    await user.type(phoneInput, '5551234567');
    await user.type(emailInput, 'jane@example.com');
    await user.type(notesInput, 'Primary contact');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers/parent-1/contacts',
        expect.objectContaining({
          name: 'Jane Smith',
          phone: '5551234567',
          email: 'jane@example.com',
          notes: 'Primary contact',
        })
      );
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('updates contact with valid data', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockContact });

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={onClose}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        contact={mockContact}
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByDisplayValue('Jane Smith');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/customers/parent-1/contacts/contact-1',
        expect.objectContaining({
          name: 'Jane Doe',
        })
      );
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('uses service location endpoint for serviceLocation parentType', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockContact });

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="loc-1"
        parentType="serviceLocation"
        customerId="customer-1"
        queryKey={['customers']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, 'Jane Smith');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/service-locations/loc-1/contacts',
        expect.any(Object)
      );
    });
  });

  it('formats phone number input', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const phoneInput = screen.getByLabelText(/phone/i);
    await user.type(phoneInput, '5551234567');

    await waitFor(() => {
      expect(phoneInput).toHaveValue('(555) 123-4567');
    });
  });

  it('closes dialog on cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={onClose}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('resets form when dialog reopens', async () => {
    const { rerender } = renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.setup().type(nameInput, 'Jane Smith');

    // Close and reopen
    rerender(
      <AdditionalContactFormDialog
        isOpen={false}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    rerender(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('');
    });
  });

  it('displays saving state during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, 'Jane Smith');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/saving/i)).toBeInTheDocument();
    });
  });

  it('handles API error on create', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(apiClient.post).mockRejectedValue(new Error('API Error'));

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, 'Jane Smith');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('allows optional fields to be empty', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockContact });

    renderWithProviders(
      <AdditionalContactFormDialog
        isOpen={true}
        onClose={() => {}}
        parentId="parent-1"
        parentType="customer"
        customerId="customer-1"
        queryKey={['customers', 'parent-1']}
      />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, 'Jane Smith');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers/parent-1/contacts',
        expect.objectContaining({
          name: 'Jane Smith',
          phone: null,
          email: null,
          notes: null,
        })
      );
    });
  });

  describe('Notification Preferences', () => {
    const mockPreferences = [
      {
        id: 'pref-1',
        customerId: 'customer-1',
        contactId: 'contact-1',
        notificationTypeId: 'type-1',
        notificationTypeKey: 'work_order_scheduled',
        notificationTypeName: 'Work Order Scheduled',
        channel: 'EMAIL' as const,
        optIn: true,
      },
      {
        id: 'pref-2',
        customerId: 'customer-1',
        contactId: 'contact-1',
        notificationTypeId: 'type-1',
        notificationTypeKey: 'work_order_scheduled',
        notificationTypeName: 'Work Order Scheduled',
        channel: 'SMS' as const,
        optIn: false,
      },
    ];

    it('does not show notification preferences in create mode', () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          queryKey={['customers', 'parent-1']}
        />
      );

      expect(screen.queryByText('Notification Preferences')).not.toBeInTheDocument();
    });

    it('shows notification preferences section in edit mode', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });
    });

    it('fetches contact preferences when editing', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/notification-preferences/customers/customer-1/contacts/contact-1'
        );
      });
    });

    it('displays notification preferences in table when expanded', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });
    });

    it('collapses and expands notification preferences section', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      // Wait for preferences to load and be visible (expanded by default in edit mode)
      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });

      // Click to collapse
      const toggleButton = screen.getByRole('button', { name: /notification preferences/i });
      await user.click(toggleButton);

      // Table should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Work Order Scheduled')).not.toBeInTheDocument();
      });

      // Click to expand
      await user.click(toggleButton);

      // Table should be visible again
      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });
    });

    it('toggles notification preference checkbox', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockContact });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      const emailCheckbox = checkboxes[0]; // First checkbox (EMAIL)

      await user.click(emailCheckbox);

      // Should just update local state, not call API yet (preferences saved on form submit)
      expect(apiClient.put).not.toHaveBeenCalledWith(
        expect.stringContaining('/notification-preferences/'),
        expect.anything()
      );
    });

    it('updates preferences when form is submitted', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockContact });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });

      // Toggle the SMS preference (currently false, toggle to true)
      const checkboxes = screen.getAllByRole('checkbox');
      const smsCheckbox = checkboxes[1]; // Second checkbox (SMS)

      await user.click(smsCheckbox);

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /save/i });
      await user.click(submitButton);

      // Should update contact AND preference
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/customers/parent-1/contacts/contact-1',
          expect.any(Object)
        );
        expect(apiClient.put).toHaveBeenCalledWith(
          '/notification-preferences/pref-2',
          { optIn: true }
        );
      });
    });

    it('creates new preference when toggling uncreated preference', async () => {
      const user = userEvent.setup();

      const preferencesWithNull = [
        {
          id: null, // No preference created yet
          customerId: 'customer-1',
          contactId: 'contact-1',
          notificationTypeId: 'type-1',
          notificationTypeKey: 'work_order_scheduled',
          notificationTypeName: 'Work Order Scheduled',
          channel: 'PUSH' as const,
          optIn: false,
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: preferencesWithNull });
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockContact });
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });

      // Toggle the PUSH preference (currently false/null, toggle to true)
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /save/i });
      await user.click(submitButton);

      // Should create new preference
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/notification-preferences',
          expect.objectContaining({
            customerId: 'customer-1',
            contactId: 'contact-1',
            notificationTypeId: 'type-1',
            optIn: true,
          })
        );
      });
    });

    it('handles no preference changes on submit', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences });
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockContact });

      renderWithProviders(
        <AdditionalContactFormDialog
          isOpen={true}
          onClose={() => {}}
          parentId="parent-1"
          parentType="customer"
          customerId="customer-1"
          contact={mockContact}
          queryKey={['customers', 'parent-1']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Work Order Scheduled')).toBeInTheDocument();
      });

      // Don't toggle any preferences, just submit
      const submitButton = screen.getByRole('button', { name: /save/i });
      await user.click(submitButton);

      // Should only update contact, not preferences
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/customers/parent-1/contacts/contact-1',
          expect.any(Object)
        );
        // Should not call preference API if no changes
        expect(apiClient.put).toHaveBeenCalledTimes(1);
      });
    });
  });
});
