import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationsPage from './ServiceLocationsPage';
import apiClient from '../api/client';

vi.mock('../api/client');

const mockCustomers = [
  {
    id: 'customer-1',
    name: 'Test Customer',
    displayMode: 'STANDARD' as const,
    serviceLocations: [
      {
        id: 'location-1',
        customerId: 'customer-1',
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
  },
];

describe('ServiceLocationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service Locations' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add service location/i })).toBeInTheDocument();
  });

  it('displays service locations in table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

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
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no service locations found/i)).toBeInTheDocument();
    });
  });

  it('filters locations by status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Both locations visible initially
    expect(screen.getByText('Main Office')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    // Only active location visible
    expect(screen.getByText('Main Office')).toBeInTheDocument();
    expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
  });

  it('searches locations by name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Both locations visible initially
    expect(screen.getByText('Main Office')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();

    // Search for "warehouse"
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'warehouse');

    // Only warehouse visible
    await waitFor(() => {
      expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('opens add dialog when add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockCustomers[0].serviceLocations[0], status: 'CLOSED' } });

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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 service locations')).toBeInTheDocument();
    });
  });

  it('filters locations by inactive status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to INACTIVE only
    const inactiveButton = screen.getByRole('button', { name: /^inactive$/i });
    await user.click(inactiveButton);

    // Only inactive location visible
    expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('filters locations by closed status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to CLOSED only
    const closedButton = screen.getByRole('button', { name: /^closed$/i });
    await user.click(closedButton);

    // No locations should be visible (none are closed)
    expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
    expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
  });

  it('displays filtered count when filter is active', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 service locations')).toBeInTheDocument();
    });

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    // Should show filtered count
    await waitFor(() => {
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });
  });

  it('resets filter when "all" button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Filter to ACTIVE only
    const activeButton = screen.getByRole('button', { name: /^active$/i });
    await user.click(activeButton);

    await waitFor(() => {
      expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
    });

    // Reset filter
    const allButton = screen.getByRole('button', { name: /all statuses/i });
    await user.click(allButton);

    // Both locations should be visible again
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
      expect(screen.getByText('Warehouse')).toBeInTheDocument();
    });
  });

  it('displays "add first" button in empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no service locations found/i)).toBeInTheDocument();
    });

    // Should show "add first" button (using regex to match partial text)
    const addButton = screen.getByRole('button', { name: /add your first/i });
    expect(addButton).toBeInTheDocument();
  });

  it('opens dialog when "add first" button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search for something that doesn't exist
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'nonexistent location');

    // Should show no match message
    await waitFor(() => {
      expect(screen.getByText(/no .* match/i)).toBeInTheDocument();
    });
  });

  it('closes dialog when handleCloseDialog is called', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Phone should be a link
    const phoneLink = screen.getByRole('link', { name: /\(555\) 123-4567/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');
  });

  it('displays dash when no contact information available', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

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
    const customerWithLine2 = {
      ...mockCustomers[0],
      serviceLocations: [
        {
          ...mockCustomers[0].serviceLocations[0],
          address: {
            ...mockCustomers[0].serviceLocations[0].address,
            streetAddressLine2: 'Suite 200',
          },
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithLine2] });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/suite 200/i)).toBeInTheDocument();
    });
  });

  it('cancels close location when confirm dialog is dismissed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

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
    const closedCustomer = {
      ...mockCustomers[0],
      serviceLocations: [
        {
          ...mockCustomers[0].serviceLocations[0],
          status: 'CLOSED' as const,
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [closedCustomer] });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Search by city
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'springfield');

    // Both locations are in Springfield
    expect(screen.getByText('Main Office')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('searches by customer name', async () => {
    const multipleCustomers = [
      ...mockCustomers,
      {
        ...mockCustomers[0],
        id: 'customer-2',
        name: 'Different Customer',
        serviceLocations: [
          {
            ...mockCustomers[0].serviceLocations[0],
            id: 'location-3',
            locationName: 'Remote Office',
          },
        ],
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValue({ data: multipleCustomers });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
      expect(screen.getByText('Remote Office')).toBeInTheDocument();
    });

    // Search by customer name
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'different');

    // Only "Different Customer" locations should be visible
    await waitFor(() => {
      expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
      expect(screen.getByText('Remote Office')).toBeInTheDocument();
    });
  });

  it('displays singular form for single location count', async () => {
    const singleLocationCustomer = {
      ...mockCustomers[0],
      serviceLocations: [mockCustomers[0].serviceLocations[0]],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [singleLocationCustomer] });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/1 service location$/i)).toBeInTheDocument();
    });
  });
});
