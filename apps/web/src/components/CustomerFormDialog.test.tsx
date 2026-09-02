import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomerFormDialog from './CustomerFormDialog';
import { apiClient } from '../api/setup';
import type { Customer } from '../api/setup';
import { HEAVY_FORM_TIMEOUT } from '../test/timeouts';

// Mock the API client
vi.mock('@dispatch/api/src/client');

describe('CustomerFormDialog', () => {
  const mockOnClose = vi.fn();

  const mockCustomer: Customer = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '5551234567',
    type: 'STANDARD',
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
    additionalContacts: [],
    serviceLocations: [
      {
        id: 'loc-1',
        customerId: '1',
        dispatchRegionId: 'region-1',
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
        additionalContacts: [],
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
    category: 'RESIDENTIAL',
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

    it('displays saving state during submission', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in all required fields
      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');

      // For PatternFormat phone field, use fireEvent with formatted value
      const phoneInput = screen.getByLabelText(/^phone/i);
      fireEvent.change(phoneInput, { target: { value: '(555) 123-4567' } });

      // Service address fields (required)
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      // State is a select dropdown, not a text input
      await user.selectOptions(screen.getByLabelText(/^state \*/i), 'MA');
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

    it('handles all form fields including optional fields', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockCustomer });

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill required fields
      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');

      // For PatternFormat phone field, use fireEvent with formatted value
      const phoneInput = screen.getByLabelText(/^phone/i);
      fireEvent.change(phoneInput, { target: { value: '(555) 123-4567' } });

      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');

      // Fill service location address
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/address line 2/i), 'Suite 100');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      // State is a select dropdown, not a text input
      await user.selectOptions(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      // Expand and fill optional sections
      // Site Contact
      await user.click(screen.getByRole('button', { name: /site contact/i }));
      await user.type(screen.getByLabelText(/^name$/i), 'Jane Manager');
      const phoneInputs = screen.getAllByLabelText(/^phone$/i);
      const sitePhoneInput = phoneInputs[phoneInputs.length - 1];
      fireEvent.change(sitePhoneInput, { target: { value: '(555) 567-8901' } });
      const emailInputs = screen.getAllByLabelText(/^email$/i);
      await user.type(emailInputs[emailInputs.length - 1], 'jane@example.com');

      // Access Instructions
      await user.click(screen.getByRole('button', { name: /access instructions/i }));
      await user.type(screen.getByPlaceholderText(/use back entrance/i), 'Use back door');

      // Business Terms
      await user.click(screen.getByRole('button', { name: /business terms/i }));
      await user.type(screen.getByLabelText(/payment terms/i), '30');
      await user.type(screen.getByLabelText(/contract tier/i), 'GOLD');
      await user.click(screen.getByRole('checkbox', { name: /requires purchase order/i }));
      await user.click(screen.getByRole('checkbox', { name: /tax exempt/i }));
      await user.type(screen.getByLabelText(/tax cert/i), 'TAX-12345');
      await user.type(screen.getByLabelText(/notes/i), 'VIP customer');

      // Submit
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/customers', expect.objectContaining({
          name: 'John Doe',
          email: 'john@example.com',
          phone: '5551234567',
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
      expect(screen.getByDisplayValue('(555) 123-4567')).toBeInTheDocument();
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
          phone: '5551234567',
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
      await user.click(screen.getByRole('checkbox', { name: /requires purchase order/i }));
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

  describe('Billing-only customer', () => {
    it('renders billing-only fields when the BILLING_ONLY type is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Switch to billing-only — the standard service-location grid goes away
      // and the billing-only address grid takes its place. Catalyst radios use
      // Headless UI under the hood and respond to clicks on the value-bearing
      // span, not the hidden <input>. The i18n mock leaves the radio's label
      // as the literal i18n key, so we match on that.
      const billingOnlyRadio = screen.getByRole('radio', {
        name: 'customers.form.customerTypeBillingOnly',
      });
      await user.click(billingOnlyRadio);

      // The billing-only branch uses dedicated input names so we don't fight
      // duplicate labels with the standard branch.
      const nameInput = document.querySelector('input[name="billingOnlyName"]') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      await user.type(nameInput, 'Acme Warranty');

      // Email — billing-only branch
      const emailInput = screen.getByLabelText(/^email \*/i);
      await user.type(emailInput, 'billing@acme.com');

      // Phone — single field in this branch
      const phoneInput = screen.getByLabelText(/^phone/i);
      fireEvent.change(phoneInput, { target: { value: '(555) 999-1234' } });

      // Address fields
      const streetInput = document.querySelector('input[name="billingStreetAddress"]') as HTMLInputElement;
      await user.type(streetInput, '500 Corporate Way');

      const line2Input = document.querySelector('input[name="billingStreetAddressLine2"]') as HTMLInputElement;
      await user.type(line2Input, 'Suite 200');

      const cityInput = document.querySelector('input[name="billingCity"]') as HTMLInputElement;
      await user.type(cityInput, 'New York');

      const stateSelect = document.querySelector('select[name="billingState"]') as HTMLSelectElement;
      await user.selectOptions(stateSelect, 'NY');

      const zipInput = document.querySelector('input[name="billingZipCode"]') as HTMLInputElement;
      await user.type(zipInput, '10001');

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockCustomer });
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/customers', expect.objectContaining({
          name: 'Acme Warranty',
          email: 'billing@acme.com',
          phone: '5559991234',
          type: 'BILLING_ONLY',
          billingAddress: expect.objectContaining({
            streetAddress: '500 Corporate Way',
            streetAddressLine2: 'Suite 200',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          }),
          serviceLocations: [],
        }));
      });
    });
  });

  describe('Standard customer with separate billing address', () => {
    it('renders the billing-address section and submits both addresses', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockCustomer });
      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      // Required service-location fields
      await user.type(screen.getByLabelText(/^name \*/i), 'Joe Restaurant');
      await user.type(screen.getByLabelText(/^email \*/i), 'joe@example.com');
      const phoneInput = screen.getByLabelText(/^phone/i);
      fireEvent.change(phoneInput, { target: { value: '(555) 222-3333' } });

      await user.type(screen.getByLabelText(/^street address \*/i), '10 Service Rd');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      await user.selectOptions(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      // Toggle off "send invoice to same address" so the billing section renders
      const sameAddressCheckbox = screen.getByRole('checkbox', { name: /send invoice to same address/i });
      await user.click(sameAddressCheckbox);

      // Now the billing recipient block exists — fill it. The recipient block
      // owns the customer-level "name" field (locationName is the service-loc
      // name only), so we have to fill the billing name explicitly here.
      const billingNameField = document.querySelector('input[name="billingName"]') as HTMLInputElement;
      await user.type(billingNameField, 'Joe Restaurant Corp');

      const billingStreet = document.querySelector('input[name="billingStreetAddress"]') as HTMLInputElement;
      await user.type(billingStreet, '99 Corporate Blvd');

      const billingLine2 = document.querySelector('input[name="billingStreetAddressLine2"]') as HTMLInputElement;
      await user.type(billingLine2, 'Fl 4');

      const billingCity = document.querySelector('input[name="billingCity"]') as HTMLInputElement;
      await user.type(billingCity, 'Cambridge');

      const billingState = document.querySelector('select[name="billingState"]') as HTMLSelectElement;
      await user.selectOptions(billingState, 'MA');

      const billingZip = document.querySelector('input[name="billingZipCode"]') as HTMLInputElement;
      await user.type(billingZip, '02139');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/customers', expect.objectContaining({
          billingAddressSameAsService: false,
          billingAddress: expect.objectContaining({
            streetAddress: '99 Corporate Blvd',
            streetAddressLine2: 'Fl 4',
            city: 'Cambridge',
            state: 'MA',
            zipCode: '02139',
          }),
        }));
      });
    });
  });

  describe('API error handling', () => {
    it('alerts when create fails with an API error message', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const apiError = Object.assign(new Error('boom'), {
        response: { data: { message: 'Email already exists' } },
      });
      vi.mocked(apiClient.post).mockRejectedValue(apiError);

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      await user.selectOptions(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Email already exists');
      });

      // onClose should NOT be called on error
      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('falls back to a generic message when the API error has no message', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));

      renderWithProviders(<CustomerFormDialog isOpen={true} onClose={mockOnClose} />);

      await user.type(screen.getByLabelText(/^name \*/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email \*/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^street address \*/i), '123 Main St');
      await user.type(screen.getByLabelText(/^city \*/i), 'Boston');
      await user.selectOptions(screen.getByLabelText(/^state \*/i), 'MA');
      await user.type(screen.getByLabelText(/^zip code \*/i), '02101');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to create customer');
      });
      alertSpy.mockRestore();
    });

    it('alerts when update fails', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const apiError = Object.assign(new Error('boom'), {
        response: { data: { message: 'Validation failed' } },
      });
      vi.mocked(apiClient.put).mockRejectedValue(apiError);

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Jane Doe');

      await user.click(screen.getByRole('button', { name: /update/i }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Validation failed');
      });
      alertSpy.mockRestore();
    });
  });

  describe('Edit mode billing address and type', () => {
    it('persists identity + billing-address edits in a single PUT', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockCustomer });

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={mockCustomer} />
      );

      // Update email (triggers the edit-mode email onChange)
      const emailInput = screen.getByDisplayValue('john@example.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'new@example.com');

      // Update each billing-address field — these are the edit-mode handlers
      // that the original test never touched.
      const street = screen.getByDisplayValue('123 Main St');
      await user.clear(street);
      await user.type(street, '999 New St');

      const line2Field = document.querySelector('input[name="billingStreetAddressLine2"]') as HTMLInputElement;
      await user.clear(line2Field);
      await user.type(line2Field, 'Apt 5');

      const city = screen.getByDisplayValue('Boston');
      await user.clear(city);
      await user.type(city, 'Cambridge');

      const stateSelect = document.querySelector('select[name="billingState"]') as HTMLSelectElement;
      await user.selectOptions(stateSelect, 'NY');

      const zip = screen.getByDisplayValue('02101');
      await user.clear(zip);
      await user.type(zip, '10001');

      await user.click(screen.getByRole('button', { name: /update/i }));

      // Identity AND the changed billing address ride one PUT to /customers/1 —
      // no separate /billing-address round-trip (the race that produced).
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/customers/1', expect.objectContaining({
          email: 'new@example.com',
          billingAddress: expect.objectContaining({
            streetAddress: '999 New St',
            streetAddressLine2: 'Apt 5',
            city: 'Cambridge',
            state: 'NY',
            zipCode: '10001',
          }),
        }));
      });

      expect(apiClient.put).not.toHaveBeenCalledWith(
        '/customers/1/billing-address',
        expect.anything()
      );
    });

    it('toggling the type radio sends the new type', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockCustomer });

      // BILLING_ONLY customers don't have active locations, so toggling to
      // STANDARD isn't blocked.
      const billingOnly = {
        ...mockCustomer,
        type: 'BILLING_ONLY' as const,
        serviceLocations: [],
      };

      renderWithProviders(
        <CustomerFormDialog isOpen={true} onClose={mockOnClose} customer={billingOnly} />
      );

      // Flip the type to STANDARD — the i18n mock leaves the radio's label as
      // the literal i18n key, so we match on that.
      const standardRadio = screen.getByRole('radio', {
        name: 'customers.form.customerTypeStandard',
      });
      await user.click(standardRadio);

      await user.click(screen.getByRole('button', { name: /update/i }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/customers/1', expect.objectContaining({
          type: 'STANDARD',
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
