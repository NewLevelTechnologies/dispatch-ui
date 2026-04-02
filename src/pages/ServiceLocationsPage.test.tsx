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
});
