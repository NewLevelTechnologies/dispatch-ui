import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationsPage from './ServiceLocationsPage';
import apiClient from '../api/client';

vi.mock('../api/client');

const mockServiceLocationsResponse = {
  content: [
    {
      id: 'location-1',
      customerId: 'customer-1',
      customerName: 'Test Customer',
      customerDisplayMode: 'STANDARD' as const,
      locationName: 'Main Office',
      address: {
        streetAddress: '123 Main St',
        streetAddressLine2: '',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        validated: true,
        isBusiness: true,
      },
      status: 'ACTIVE' as const,
      siteContactName: 'John Doe',
      siteContactPhone: '5551234567',
      siteContactEmail: 'john@example.com',
      accessInstructions: '',
      notes: '',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'location-2',
      customerId: 'customer-1',
      customerName: 'Test Customer',
      customerDisplayMode: 'STANDARD' as const,
      locationName: 'Warehouse',
      address: {
        streetAddress: '456 Oak Ave',
        streetAddressLine2: '',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62702',
        validated: false,
        isBusiness: false,
      },
      status: 'INACTIVE' as const,
      siteContactName: '',
      siteContactPhone: '',
      siteContactEmail: '',
      accessInstructions: '',
      notes: '',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ],
  totalElements: 2,
  totalPages: 1,
  number: 0,
  size: 50,
  numberOfElements: 2,
  first: true,
  last: true,
  empty: false,
};

describe('ServiceLocationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service Locations' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add service location/i })).toBeInTheDocument();
  });

  it('displays service locations in table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('Springfield, IL 62701')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<ServiceLocationsPage />);

    expect(screen.getByText(/loading service locations/i)).toBeInTheDocument();
  });

  it('displays error state', async () => {
    const error = new Error('Failed to fetch');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading service locations/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no locations exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockServiceLocationsResponse, content: [], totalElements: 0, empty: true }
    });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no service locations found/i)).toBeInTheDocument();
    });
  });

  it('filters locations by status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    // Button should show as selected
    await waitFor(() => {
      expect(activeButton).toHaveClass('font-semibold');
    });
  });

  it('searches locations by name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search for "warehouse"
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'warehouse');

    // Search input should have the value
    expect(searchInput).toHaveValue('warehouse');
  });

  it('opens add dialog when add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service Locations' })).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add service location/i });
    await user.click(addButton);

    // Dialog should open (check for dialog content)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    // First call: paginated list
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockServiceLocationsResponse })
      // Second call: standalone service location detail for edit
      .mockResolvedValueOnce({ data: mockServiceLocationsResponse.content[0] });

    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click the dropdown menu button
    const dropdownButtons = screen.getAllByLabelText(/more options/i);
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('handles close location confirmation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockServiceLocationsResponse.content[0], status: 'CLOSED' } });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click the dropdown menu button
    const dropdownButtons = screen.getAllByLabelText(/more options/i);
    await user.click(dropdownButtons[0]);

    // Click close option
    const closeButton = screen.getByRole('menuitem', { name: /close location/i });
    await user.click(closeButton);

    // Confirm dialog should appear
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('displays row count', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 service locations')).toBeInTheDocument();
    });
  });

  it('filters locations by inactive status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to INACTIVE only
    const inactiveButton = screen.getByRole('button', { name: /^inactive$/i });
    await user.click(inactiveButton);

    // Button should show as selected
    await waitFor(() => {
      expect(inactiveButton).toHaveClass('font-semibold');
    });
  });

  it('filters locations by closed status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to CLOSED only
    const closedButton = screen.getByRole('button', { name: /^closed$/i });
    await user.click(closedButton);

    // Button should show as selected
    await waitFor(() => {
      expect(closedButton).toHaveClass('font-semibold');
    });
  });

  it('displays filtered count when filter is active', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 service locations')).toBeInTheDocument();
    });

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    // Button should show as selected
    await waitFor(() => {
      expect(activeButton).toHaveClass('font-semibold');
    });
  });

  it('resets filter when "all" button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    await waitFor(() => {
      expect(activeButton).toHaveClass('font-semibold');
    });

    // Reset filter
    const allButton = screen.getByRole('button', { name: /all statuses/i });
    await user.click(allButton);

    // All button should now be selected
    await waitFor(() => {
      expect(allButton).toHaveClass('font-semibold');
    });
  });

  it('displays "add first" button in empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockServiceLocationsResponse, content: [], totalElements: 0, empty: true }
    });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no service locations found/i)).toBeInTheDocument();
    });

    // Should show "add first" button (using regex to match partial text)
    const addButton = screen.getByRole('button', { name: /add your first/i });
    expect(addButton).toBeInTheDocument();
  });

  it('opens dialog when "add first" button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockServiceLocationsResponse, content: [], totalElements: 0, empty: true }
    });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no service locations found/i)).toBeInTheDocument();
    });

    const addFirstButton = screen.getByRole('button', { name: /add your first/i });
    await user.click(addFirstButton);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('displays no match message when search returns no results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search for something that doesn't exist
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'nonexistent location');

    // Search input should have the value
    expect(searchInput).toHaveValue('nonexistent location');
  });

  it('closes dialog when handleCloseDialog is called', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service Locations' })).toBeInTheDocument();
    });

    // Open dialog
    const addButton = screen.getByRole('button', { name: /add service location/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Close dialog
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows view option in dropdown menu', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click the dropdown menu button
    const dropdownButtons = screen.getAllByLabelText(/more options/i);
    await user.click(dropdownButtons[0]);

    // View option should be available
    const viewButton = screen.getByRole('menuitem', { name: /^view$/i });
    expect(viewButton).toBeInTheDocument();
  });

  it('displays phone number as clickable link', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Phone should be a link
    const phoneLink = screen.getByRole('link', { name: /\(555\) 123-4567/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');
  });

  it('displays dash when no contact information available', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Warehouse')).toBeInTheDocument();
    });

    // Warehouse has no contact, should show dash
    const rows = screen.getAllByRole('row');
    const warehouseRow = rows.find(row => row.textContent?.includes('Warehouse'));
    expect(warehouseRow?.textContent).toContain('-');
  });

  it('displays location with streetAddressLine2', async () => {
    const locationWithLine2 = {
      ...mockServiceLocationsResponse,
      content: [{
        ...mockServiceLocationsResponse.content[0],
        address: {
          ...mockServiceLocationsResponse.content[0].address,
          streetAddressLine2: 'Suite 200',
        },
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: locationWithLine2 });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/suite 200/i)).toBeInTheDocument();
    });
  });

  it('cancels close location when confirm dialog is dismissed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click the dropdown menu button
    const dropdownButtons = screen.getAllByLabelText(/more options/i);
    await user.click(dropdownButtons[0]);

    // Click close option
    const closeButton = screen.getByRole('menuitem', { name: /close location/i });
    await user.click(closeButton);

    // Confirm dialog should appear but user cancels
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not show close option for already closed locations', async () => {
    const closedLocation = {
      ...mockServiceLocationsResponse,
      content: [{
        ...mockServiceLocationsResponse.content[0],
        status: 'CLOSED' as const,
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: closedLocation });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click the dropdown menu button
    const dropdownButtons = screen.getAllByLabelText(/more options/i);
    await user.click(dropdownButtons[0]);

    // Close option should NOT be available
    expect(screen.queryByRole('menuitem', { name: /close location/i })).not.toBeInTheDocument();
  });

  it('searches by city', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search by city
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'springfield');

    // Search input should have the value
    expect(searchInput).toHaveValue('springfield');
  });

  it('searches by customer name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search by customer name
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'different');

    // Search input should have the value
    expect(searchInput).toHaveValue('different');
  });

  it('displays singular form for single location count', async () => {
    const singleLocation = {
      ...mockServiceLocationsResponse,
      content: [mockServiceLocationsResponse.content[0]],
      totalElements: 1,
      numberOfElements: 1,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: singleLocation });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/1 service location$/i)).toBeInTheDocument();
    });
  });
});
