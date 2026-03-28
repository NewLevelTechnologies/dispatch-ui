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

  it('displays settings data in view mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    // Company information is compact: name, address, phone, email only
    expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street')).toBeInTheDocument();
    expect(screen.getByText('Springfield, IL 62701')).toBeInTheDocument();
    expect(screen.getByText('555-123-4567')).toBeInTheDocument();
    expect(screen.getByText('info@acmehvac.com')).toBeInTheDocument();
    expect(screen.getByText('America/Chicago')).toBeInTheDocument();
    expect(screen.getByText('Net 30')).toBeInTheDocument();
  });

  it('displays all section headings', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Company Information')).toBeInTheDocument();
    });

    expect(screen.getByText('Branding & Logo')).toBeInTheDocument();
    expect(screen.getByText('Business Settings')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();
  });

  it('displays feature flags in view mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Enable Online Booking')).toBeInTheDocument();
    });

    expect(screen.getByText('Enable SMS Notifications')).toBeInTheDocument();
    expect(screen.getByText('Enable Email Notifications')).toBeInTheDocument();
    // Check that all three show "Enabled" status
    const enabledBadges = screen.getAllByText('Enabled');
    expect(enabledBadges).toHaveLength(3);
  });

  it('updates form field when user types in edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode to load and click Edit button
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, find and update the input
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

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Update form field
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

  it('toggles feature flag checkbox in edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, toggle checkbox
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /enable online booking/i })).toBeChecked();
    });

    const onlineBookingCheckbox = screen.getByRole('checkbox', { name: /enable online booking/i });
    await user.click(onlineBookingCheckbox);

    expect(onlineBookingCheckbox).not.toBeChecked();
  });

  it('validates logo file size in edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, find file input
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

  it('uploads logo successfully', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        message: 'Logo uploaded successfully',
        urls: {
          original: 'https://example.com/logo.png',
          large: 'https://example.com/logo-large.png',
          medium: 'https://example.com/logo-medium.png',
          small: 'https://example.com/logo-small.png',
          thumbnail: 'https://example.com/logo-thumbnail.png',
        }
      }
    });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, upload a valid file
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(['logo content'], 'logo.png', { type: 'image/png' });

    await user.upload(fileInput, validFile);

    // Click upload button
    const uploadButton = screen.getByRole('button', { name: /upload logo/i });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/tenant-settings/logo',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    });
  });

  it('has file input with correct accept attribute in edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, verify file input
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme HVAC Services')).toBeInTheDocument();
    });

    // Verify file input exists and has correct accept attribute
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.accept).toBe('image/png,image/jpeg');
  });

  it('displays save button in edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, check for Update button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /update/i });
    expect(submitButton).not.toBeDisabled();
  });
});
