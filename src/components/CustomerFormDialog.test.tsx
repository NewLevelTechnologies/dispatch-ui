import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomerFormDialog from './CustomerFormDialog';
import apiClient from '../api/client';
import type { Customer } from '../api';

// Mock the API client
vi.mock('../api/client');

describe('CustomerFormDialog', () => {
  const mockOnClose = vi.fn();

  const mockCustomer: Customer = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-1234',
    billingAddress: {
      streetAddress: '123 Main St',
      streetAddressLine2: null,
      city: 'Boston',
      state: 'MA',
      zipCode: '02101',
      country: 'US',
      validated: true,
      validatedAt: '2024-01-01T00:00:00Z',
      dpvConfirmation: 'Y',
      isBusiness: false,
    },
    serviceLocations: [
      {
        id: 'loc-1',
        customerId: '1',
        locationName: null,
        address: {
          streetAddress: '123 Main St',
          streetAddressLine2: null,
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
          validated: true,
          validatedAt: '2024-01-01T00:00:00Z',
          dpvConfirmation: 'Y',
          isBusiness: false,
        },
        previousLocationId: null,
        successionDate: null,
        successionType: null,
        siteContactName: null,
        siteContactPhone: null,
        siteContactEmail: null,
        accessInstructions: null,
        notes: null,
        status: 'ACTIVE',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        version: 0,
      },
    ],
    paymentTermsDays: 0,
    requiresPurchaseOrder: false,
    contractPricingTier: null,
    taxExempt: false,
    taxExemptCertificate: null,
    notes: null,
    status: 'ACTIVE',
    displayMode: 'SIMPLE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders create dialog with empty form', () => {
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Add Customer')).toBeInTheDocument();
      expect(screen.getByText('Create a new customer record.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });

    it('validates required fields', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      // Form should prevent submission with empty required fields
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('displays saving state during submission', { timeout: 20000 }, async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in all required fields
      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^phone/i), '555-1234');

      // Service address fields (required)
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      await user.type(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
    });

    it('shows tax exempt certificate field when tax exempt is checked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Expand Business Terms section first
      await user.click(screen.getByRole('button', { name: /business terms/i }));

      // Tax exempt certificate field should not be visible initially
      expect(screen.queryByLabelText(/tax cert/i)).not.toBeInTheDocument();

      // Check tax exempt checkbox
      const taxExemptCheckbox = screen.getByRole('checkbox', { name: /tax exempt/i });
      await user.click(taxExemptCheckbox);

      // Tax exempt certificate field should now be visible
      await waitFor(() => {
        expect(screen.getByLabelText(/tax cert/i)).toBeInTheDocument();
      });

      // Fill in the certificate field
      const certificateInput = screen.getByLabelText(/tax cert/i);
      await user.type(certificateInput, 'TAX-12345');
      expect(certificateInput).toHaveValue('TAX-12345');
    });

    it('shows billing address fields when billing address same as service is unchecked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Initially, billing section should not be visible
      expect(screen.queryByText(/invoice recipient/i)).not.toBeInTheDocument();

      // Uncheck billing address same as service
      const billingCheckbox = screen.getByRole('checkbox', { name: /send invoice to same address/i });
      await user.click(billingCheckbox);

      // Now billing section should be visible
      await waitFor(() => {
        expect(screen.getByText(/invoice recipient/i)).toBeInTheDocument();
      });
    });

    it('handles all form fields including optional fields', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockCustomer });

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill required fields
      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');
      await user.type(screen.getByLabelText(/^phone/i), '555-1234');
      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');

      // Fill service location address
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/address line 2/i), 'Suite 100');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      await user.type(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      // Expand and fill optional sections
      // Site Contact
      await user.click(screen.getByRole('button', { name: /site contact/i }));
      await user.type(screen.getByLabelText(/^name$/i), 'Jane Manager');
      const phoneInputs = screen.getAllByLabelText(/^phone$/i);
      await user.type(phoneInputs[phoneInputs.length - 1], '555-5678');
      const emailInputs = screen.getAllByLabelText(/^email$/i);
      await user.type(emailInputs[emailInputs.length - 1], 'jane@example.com');

      // Access Instructions
      await user.click(screen.getByRole('button', { name: /access instructions/i }));
      await user.type(screen.getByPlaceholderText(/use back entrance/i), 'Use back door');

      // Business Terms
      await user.click(screen.getByRole('button', { name: /business terms/i }));
      await user.type(screen.getByLabelText(/payment terms/i), '30');
      await user.type(screen.getByLabelText(/contract tier/i), 'GOLD');
      await user.click(screen.getByRole('checkbox', { name: /requires po/i }));
      await user.click(screen.getByRole('checkbox', { name: /tax exempt/i }));
      await user.type(screen.getByLabelText(/tax cert/i), 'TAX-12345');
      await user.type(screen.getByLabelText(/notes/i), 'VIP customer');

      // Submit
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/customers', expect.objectContaining({
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          paymentTermsDays: 30,
          requiresPurchaseOrder: true,
          taxExempt: true,
          taxExemptCertificate: 'TAX-12345',
          contractPricingTier: 'GOLD',
          notes: 'VIP customer',
        }));
      });
    });
  });

  describe('Edit mode', () => {
    it('renders edit dialog with populated form', () => {
      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      expect(screen.getByText('Edit Customer')).toBeInTheDocument();
      expect(screen.getByText('Update customer information.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with customer data', () => {
      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument();
    });

    it('submits updated data', { timeout: 10000 }, async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockCustomer });

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      // Update name
      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Jane Doe');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/customers/1', expect.objectContaining({
          name: 'Jane Doe',
          email: 'john@example.com',
          phone: '555-1234',
        }));
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('shows tax exempt certificate field when tax exempt is checked in edit mode', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      // Expand Business Terms section
      await user.click(screen.getByRole('button', { name: /business terms/i }));

      // Tax exempt certificate field should not be visible initially
      expect(screen.queryByLabelText(/tax cert/i)).not.toBeInTheDocument();

      // Check tax exempt checkbox
      const taxExemptCheckbox = screen.getByRole('checkbox', { name: /tax exempt/i });
      await user.click(taxExemptCheckbox);

      // Tax exempt certificate field should now be visible
      expect(screen.getByLabelText(/tax cert/i)).toBeInTheDocument();

      // Fill in the certificate field
      const certificateInput = screen.getByLabelText(/tax cert/i);
      await user.type(certificateInput, 'TAX-67890');
      expect(certificateInput).toHaveValue('TAX-67890');
    });

    it('handles all edit form fields including status', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockCustomer });

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      // Update various fields
      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Jane Smith');

      // Expand Business Terms section
      await user.click(screen.getByRole('button', { name: /business terms/i }));

      await user.type(screen.getByLabelText(/payment terms/i), '60');
      await user.type(screen.getByLabelText(/contract tier/i), 'PLATINUM');
      await user.click(screen.getByRole('checkbox', { name: /requires po/i }));
      await user.click(screen.getByRole('checkbox', { name: /tax exempt/i }));
      await user.type(screen.getByLabelText(/tax cert/i), 'TAX-99999');
      await user.type(screen.getByLabelText(/notes/i), 'Updated notes');

      // Change status to INACTIVE
      const inactiveRadio = screen.getByRole('radio', { name: /inactive/i });
      await user.click(inactiveRadio);

      // Submit
      await user.click(screen.getByRole('button', { name: /update/i }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/customers/1', expect.objectContaining({
          name: 'Jane Smith',
          paymentTermsDays: 60,
          requiresPurchaseOrder: true,
          taxExempt: true,
          taxExemptCertificate: 'TAX-99999',
          contractPricingTier: 'PLATINUM',
          notes: 'Updated notes',
          status: 'INACTIVE',
        }));
      });
    });
  });

  describe('Dialog behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(<CustomerFormDialog isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('resets form when dialog is closed and reopened', () => {
      const { rerender } = renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} />
      );

      // Dialog is open, should show form
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Close dialog
      rerender(<CustomerFormDialog isOpen={false} onClose={mockOnClose} />);

      // Reopen with customer data
      rerender(<CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />);

      // Should show customer data
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    });
  });
});
