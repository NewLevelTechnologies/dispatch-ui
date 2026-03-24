import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationFormDialog from './ServiceLocationFormDialog';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('ServiceLocationFormDialog', () => {
  const mockOnClose = vi.fn();
  const mockCustomerId = 'customer-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog with form fields', () => {
    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    expect(screen.getByText('Create Service Location')).toBeInTheDocument();
    expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Main Office');
    await user.type(screen.getByLabelText(/street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/city/i), 'Boston');
    await user.type(screen.getByLabelText(/state/i), 'MA');
    await user.type(screen.getByLabelText(/zip code/i), '02101');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        `/customers/${mockCustomerId}/service-locations`,
        expect.objectContaining({
          locationName: 'Main Office',
          address: expect.objectContaining({
            streetAddress: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
          }),
        })
      );
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('submits form with optional site contact fields', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Branch Office');
    await user.type(screen.getByLabelText(/street address/i), '456 Oak Ave');
    await user.type(screen.getByLabelText(/city/i), 'Cambridge');
    await user.type(screen.getByLabelText(/state/i), 'MA');
    await user.type(screen.getByLabelText(/zip code/i), '02139');

    const phoneInputs = screen.getAllByLabelText(/phone/i);
    await user.type(phoneInputs[phoneInputs.length - 1], '555-5678');

    const emailInputs = screen.getAllByLabelText(/email/i);
    await user.type(emailInputs[emailInputs.length - 1], 'contact@example.com');

    await user.type(screen.getByLabelText(/site contact name/i), 'Jane Manager');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        `/customers/${mockCustomerId}/service-locations`,
        expect.objectContaining({
          siteContactName: 'Jane Manager',
          siteContactPhone: '555-5678',
          siteContactEmail: 'contact@example.com',
        })
      );
    });
  });

  it('resets form when dialog reopens', () => {
    const { rerender } = renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    const locationInput = screen.getByLabelText(/location name/i) as HTMLInputElement;
    expect(locationInput.value).toBe('');

    rerender(<ServiceLocationFormDialog isOpen={false} onClose={mockOnClose} customerId={mockCustomerId} />);
    rerender(<ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />);

    expect(locationInput.value).toBe('');
  });

  it('displays saving state during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Office');
    await user.type(screen.getByLabelText(/street address/i), '789 Elm St');
    await user.type(screen.getByLabelText(/city/i), 'Newton');
    await user.type(screen.getByLabelText(/state/i), 'MA');
    await user.type(screen.getByLabelText(/zip code/i), '02458');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  it('converts state to uppercase', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Test');
    await user.type(screen.getByLabelText(/street address/i), '123 Main');
    await user.type(screen.getByLabelText(/city/i), 'Boston');
    await user.type(screen.getByLabelText(/state/i), 'ma');
    await user.type(screen.getByLabelText(/zip code/i), '02101');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          address: expect.objectContaining({
            state: 'MA',
          }),
        })
      );
    });
  });

  it('submits form with access instructions', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Main');
    await user.type(screen.getByLabelText(/street address/i), '123 St');
    await user.type(screen.getByLabelText(/city/i), 'Boston');
    await user.type(screen.getByLabelText(/state/i), 'MA');
    await user.type(screen.getByLabelText(/zip code/i), '02101');
    await user.type(screen.getByLabelText(/access instructions/i), 'Use back door');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          accessInstructions: 'Use back door',
        })
      );
    });
  });

  it('handles error on submission', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(apiClient.post).mockRejectedValue(new Error('API Error'));

    renderWithProviders(
      <ServiceLocationFormDialog isOpen={true} onClose={mockOnClose} customerId={mockCustomerId} />
    );

    await user.type(screen.getByLabelText(/location name/i), 'Test');
    await user.type(screen.getByLabelText(/street address/i), '123 Main');
    await user.type(screen.getByLabelText(/city/i), 'Boston');
    await user.type(screen.getByLabelText(/state/i), 'MA');
    await user.type(screen.getByLabelText(/zip code/i), '02101');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });
});
