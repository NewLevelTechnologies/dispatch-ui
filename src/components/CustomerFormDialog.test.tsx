import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomerFormDialog from './CustomerFormDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

describe('CustomerFormDialog', () => {
  const mockOnClose = vi.fn();

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

    it('submits form with valid data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: '1' } });

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in required fields
      await user.type(screen.getByLabelText(/name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email/i), 'john@example.com');

      // Fill in optional fields
      await user.type(screen.getByLabelText(/phone/i), '555-1234');
      await user.type(screen.getByLabelText(/address/i), '123 Main St');
      await user.type(screen.getByLabelText(/city/i), 'Boston');
      await user.type(screen.getByLabelText(/state/i), 'MA');
      await user.type(screen.getByLabelText(/zip code/i), '02101');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/customers', {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          address: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
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
    const existingCustomer = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St',
      city: 'Boston',
      state: 'MA',
      zipCode: '02101',
    };

    it('renders edit dialog with populated form', () => {
      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={existingCustomer} />
      );

      expect(screen.getByText('Edit Customer')).toBeInTheDocument();
      expect(screen.getByText('Update customer information.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with customer data', () => {
      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={existingCustomer} />
      );

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument();
      expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Boston')).toBeInTheDocument();
      expect(screen.getByDisplayValue('MA')).toBeInTheDocument();
      expect(screen.getByDisplayValue('02101')).toBeInTheDocument();
    });

    it('submits updated data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: existingCustomer });

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={existingCustomer} />
      );

      // Update name
      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Jane Doe');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/customers/1', {
          id: '1',
          name: 'Jane Doe',
          email: 'john@example.com',
          phone: '555-1234',
          address: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
        });
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
      const customer = {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St',
        city: 'Boston',
        state: 'MA',
        zipCode: '02101',
      };
      rerender(<CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={customer} />);

      // Should show customer data
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    });
  });
});
