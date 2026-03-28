import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import TenantSettingsPage from './TenantSettingsPage';
import apiClient from '../api/client';

vi.mock('../api/client');

const mockSettings = {
  tenantId: 'test-tenant-id',
  companyName: 'Acme HVAC Services',
  companyNameShort: 'Acme',
  companySlogan: 'Your Comfort is Our Priority',
  logoOriginalUrl: null,
  logoLargeUrl: null,
  logoMediumUrl: null,
  logoSmallUrl: null,
  logoThumbnailUrl: null,
  primaryColor: '#1976d2',
  secondaryColor: '#dc004e',
  streetAddress: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  phone: '555-123-4567',
  fax: '555-123-4568',
  email: 'info@acmehvac.com',
  timezone: 'America/Chicago',
  defaultTaxRate: 0.0825,
  invoiceTerms: 'Net 30',
  enableOnlineBooking: true,
  enableSmsNotifications: true,
  enableEmailNotifications: true,
  updatedAt: '2026-03-27T10:30:00Z',
};

describe('TenantSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading state initially', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<TenantSettingsPage />);
    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to fetch'));
    renderWithProviders(<TenantSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/error loading tenant settings/i)).toBeInTheDocument();
    });
  });

  it('displays settings form with data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Your Comfort is Our Priority')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123 Main Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Springfield')).toBeInTheDocument();
    expect(screen.getByDisplayValue('IL')).toBeInTheDocument();
    expect(screen.getByDisplayValue('62701')).toBeInTheDocument();
    expect(screen.getByDisplayValue('555-123-4567')).toBeInTheDocument();
    expect(screen.getByDisplayValue('info@acmehvac.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('America/Chicago')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Net 30')).toBeInTheDocument();
  });

  it('displays all section headings', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Company Information')).toBeInTheDocument();
    });

    expect(screen.getByText('Branding & Logo')).toBeInTheDocument();
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('Business Settings')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();
  });

  it('displays feature flag checkboxes in correct state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      const onlineBookingCheckbox = screen.getByRole('checkbox', { name: /enable online booking/i });
      expect(onlineBookingCheckbox).toBeChecked();
    });

    const smsCheckbox = screen.getByRole('checkbox', { name: /enable sms notifications/i });
    expect(smsCheckbox).toBeChecked();

    const emailCheckbox = screen.getByRole('checkbox', { name: /enable email notifications/i });
    expect(emailCheckbox).toBeChecked();
  });

  it('updates form field when user types', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    const companyNameInput = screen.getByDisplayValue('Acme HVAC Services');
    await user.clear(companyNameInput);
    await user.type(companyNameInput, 'New Company Name');

    expect(screen.getByDisplayValue('New Company Name')).toBeInTheDocument();
  });

  it('submits form with updated data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    const companyNameInput = screen.getByDisplayValue('Acme HVAC Services');
    await user.clear(companyNameInput);
    await user.type(companyNameInput, 'Updated Company');

    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/tenant-settings',
        expect.objectContaining({
          companyName: 'Updated Company',
        })
      );
    });
  });

  it('toggles feature flag checkbox', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /enable online booking/i })).toBeChecked();
    });

    const onlineBookingCheckbox = screen.getByRole('checkbox', { name: /enable online booking/i });
    await user.click(onlineBookingCheckbox);

    expect(onlineBookingCheckbox).not.toBeChecked();
  });

  it('validates logo file size', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    // Find file input by type
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create a file larger than 5MB
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large-logo.png', { type: 'image/png' });

    await user.upload(fileInput, largeFile);

    expect(global.alert).toHaveBeenCalledWith('File size must be less than 5MB');
  });

  it('has file input with correct accept attribute', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    // Verify file input exists and has correct accept attribute
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.accept).toBe('image/png,image/jpeg');
  });

  it('displays save button in correct state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /update/i });
    expect(submitButton).not.toBeDisabled();
  });
});
