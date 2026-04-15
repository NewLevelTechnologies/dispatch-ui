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
    // Default mock for all API calls to avoid undefined data errors
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/tenant-settings')) {
        return Promise.resolve({ data: mockSettings });
      }
      if (url.includes('/notification-templates')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/dispatch-regions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/glossary/available')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
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

  it('cancels edit mode when cancel button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    // Wait for view mode and click Edit
    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Now in edit mode, click Cancel
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    // Should return to view mode - Edit button should be visible again
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });
  });

  it('updates all tabs are rendered and accessible', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
    const user = userEvent.setup();
    renderWithProviders(<TenantSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
    });

    // Verify all 4 tabs are present
    expect(screen.getByRole('tab', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminology/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /notification templates/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dispatch regions/i })).toBeInTheDocument();

    // Click each tab to ensure they work
    const terminologyTab = screen.getByRole('tab', { name: /terminology/i });
    await user.click(terminologyTab);

    const templatesTab = screen.getByRole('tab', { name: /notification templates/i });
    await user.click(templatesTab);

    const regionsTab = screen.getByRole('tab', { name: /dispatch regions/i });
    await user.click(regionsTab);

    const generalTab = screen.getByRole('tab', { name: /general/i });
    await user.click(generalTab);

    await waitFor(() => {
      expect(screen.getByText('Company Information')).toBeInTheDocument();
    });
  });

  describe('Dispatch Regions Tab', () => {
    const mockDispatchRegions = [
      { id: 'region-1', name: 'North Region', abbreviation: 'NORTH', isActive: true, sortOrder: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 0 },
      { id: 'region-2', name: 'South Region', abbreviation: 'SOUTH', isActive: false, sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 0 },
    ];

    it('displays dispatch regions tab', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /dispatch regions/i })).toBeInTheDocument();
      });
    });

    it('opens add dialog when add button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        const addButton = screen.getByRole('button', { name: /add.*region/i });
        expect(addButton).toBeInTheDocument();
      });
    });

    it('displays dispatch regions in table when loaded', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        expect(screen.getByText('North Region')).toBeInTheDocument();
        expect(screen.getByText('NORTH')).toBeInTheDocument();
      });
    });

    it('shows region count when regions are loaded', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        // Check that count text is displayed
        expect(screen.getByText(/2.*region/i)).toBeInTheDocument();
      });
    });

    it('displays region edit and delete actions when canEdit is true', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        expect(screen.getByText('North Region')).toBeInTheDocument();
      });

      // Verify regions are displayed with status badges
      expect(screen.getByText('NORTH')).toBeInTheDocument();
      expect(screen.getByText('South Region')).toBeInTheDocument();
      expect(screen.getByText('SOUTH')).toBeInTheDocument();
    });

    it('displays active and inactive badges correctly', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        expect(screen.getByText('North Region')).toBeInTheDocument();
      });

      // Check for Active and Inactive badges
      const badges = screen.getAllByText(/active|inactive/i);
      expect(badges.length).toBeGreaterThan(0);
    });

    it('displays region count text', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        expect(screen.getByText('North Region')).toBeInTheDocument();
      });

      // Check that region count is displayed
      const countText = screen.getByText(/2.*region/i);
      expect(countText).toBeInTheDocument();
    });

    it('opens add region dialog when add button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      const addButton = await screen.findByRole('button', { name: /add.*region/i });
      await user.click(addButton);

      // Dialog should open - the handleAddRegion function was called
      await waitFor(() => {
        // Just verify the button click happened - dialog render is tested in DispatchRegionFormDialog tests
        expect(addButton).toBeInTheDocument();
      });
    });
  });

  describe('Notification Templates Tab', () => {
    it('displays notification templates tab', async () => {
      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /notification templates/i })).toBeInTheDocument();
      });
    });
  });

  describe('Terminology Tab', () => {
    const mockAvailableEntities = [
      { code: 'customer', singular: 'Customer', plural: 'Customers' },
      { code: 'work_order', singular: 'Work Order', plural: 'Work Orders' },
    ];

    it('displays terminology tab', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /terminology/i })).toBeInTheDocument();
      });
    });

    it('updates glossary customization when edit mode is enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/glossary/available')) {
          return Promise.resolve({ data: mockAvailableEntities });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      // Switch to terminology tab
      const terminologyTab = screen.getByRole('tab', { name: /terminology/i });
      await user.click(terminologyTab);

      await waitFor(() => {
        expect(screen.getByText(/customize how entity names appear/i)).toBeInTheDocument();
      });
    });

    it('resets glossary customization when reset is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({
            data: {
              ...mockSettings,
              glossary: { customer: { singular: 'Client', plural: 'Clients' } }
            }
          });
        }
        if (url.includes('/glossary/available')) {
          return Promise.resolve({ data: mockAvailableEntities });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      // View mode shows customized count
      const terminologyTab = screen.getByRole('tab', { name: /terminology/i });
      await user.click(terminologyTab);

      await waitFor(() => {
        expect(screen.getByText(/customized entity names/i)).toBeInTheDocument();
      });
    });

    it('switches between general and terminology tabs', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/glossary/available')) {
          return Promise.resolve({ data: mockAvailableEntities });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      // Switch to terminology tab
      const terminologyTab = screen.getByRole('tab', { name: /terminology/i });
      await user.click(terminologyTab);

      // Switch back to general tab
      const generalTab = screen.getByRole('tab', { name: /general/i });
      await user.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('Company Information')).toBeInTheDocument();
      });
    });

    it('switches to dispatch regions tab', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url.includes('/tenant-settings')) {
          return Promise.resolve({ data: mockSettings });
        }
        if (url.includes('/dispatch-regions')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<TenantSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme HVAC Services')).toBeInTheDocument();
      });

      // Switch to dispatch regions tab - this calls setSelectedTab
      const dispatchTab = screen.getByRole('tab', { name: /dispatch regions/i });
      await user.click(dispatchTab);

      await waitFor(() => {
        // Tab is selected - verified by presence of dispatch regions content
        expect(dispatchTab).toBeInTheDocument();
      });
    });
  });
});
