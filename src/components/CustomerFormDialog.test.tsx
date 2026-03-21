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

    it('displays saving state during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      await user.type(screen.getByLabelText(/name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email/i), 'john@example.com');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
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

    it('submits updated data', async () => {
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
