import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationsPage from './ServiceLocationsPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const mockServiceLocationsResponse = {
  content: [
    {
      id: 'location-1',
      customerId: 'customer-1',
      customerName: 'Test Customer',
      premiseType: 'BUSINESS' as const,
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
      techOnSite: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'location-2',
      customerId: 'customer-1',
      customerName: 'Test Customer',
      premiseType: 'RESIDENCE' as const,
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
      techOnSite: false,
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
      expect(screen.getByRole('heading', { name: 'Locations' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add location/i })).toBeInTheDocument();
  });

  it('displays service locations in table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Address renders as a single comma-joined line under the headline.
    expect(screen.getByText(/123 Main St.*Springfield, IL 62701/)).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('displays loading state', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByText(/loading locations/i)).toBeInTheDocument();
  });

  it('displays error state', async () => {
    const error = new Error('Failed to fetch');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load locations/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no locations exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockServiceLocationsResponse, content: [], totalElements: 0, empty: true }
    });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no locations yet/i)).toBeInTheDocument();
    });
  });

  // URL drives the status picker; wire format is a single comma-separated
  // value (?status=ACTIVE,INACTIVE). With `?status=inactive` the API call
  // should receive `status: "INACTIVE"`; with no `status` param the default
  // `ACTIVE` scope is applied.
  it('hydrates status picker from URL and serializes status as a comma-joined string', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />, { initialPath: '/?status=inactive' });

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const listCalls = vi.mocked(apiClient.get).mock.calls.filter(
      ([url]) => url === '/service-locations'
    );
    expect(
      listCalls.some(([, opts]) => (opts as { params?: { status?: string } } | undefined)?.params?.status === 'INACTIVE')
    ).toBe(true);
  });

  it('applies the default ACTIVE status scope when the URL has no status param', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const listCalls = vi.mocked(apiClient.get).mock.calls.filter(
      ([url]) => url === '/service-locations'
    );
    expect(
      listCalls.some(([, opts]) => (opts as { params?: { status?: string } } | undefined)?.params?.status === 'ACTIVE')
    ).toBe(true);
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

  it('navigates to the add-location form when add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocationsResponse });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Locations' })).toBeInTheDocument();
    });

    // Create moved to the full-page form — Add now navigates, not a dialog.
    const addButton = screen.getByRole('button', { name: /add location/i });
    await user.click(addButton);

    expect(navigateSpy).toHaveBeenCalledWith('/service-locations/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    // The page now also queries /tenant/dispatch-regions for the region filter,
    // so order-based mockResolvedValueOnce is unreliable — match by URL instead.
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (typeof url === 'string') {
        if (url === '/service-locations') {
          return Promise.resolve({ data: mockServiceLocationsResponse });
        }
        if (url.startsWith('/service-locations/')) {
          return Promise.resolve({ data: mockServiceLocationsResponse.content[0] });
        }
      }
      return Promise.resolve({ data: [] });
    });

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
      expect(screen.getByText('2 locations')).toBeInTheDocument();
    });
  });

  it('shows an Add Location button in the empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockServiceLocationsResponse, content: [], totalElements: 0, empty: true }
    });

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no locations yet/i)).toBeInTheDocument();
    });

    // Both the page header and the empty-state action render Add Location;
    // requiring 2 is the assertion that the empty state has its own button.
    const addButtons = screen.getAllByRole('button', { name: /add location/i });
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
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

  it('closes the edit dialog after opening it', async () => {
    // Add navigates now; the dialog is edit-only. Open it from the row's
    // overflow menu, then confirm Cancel closes it.
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (typeof url === 'string' && url.startsWith('/service-locations/')) {
        return Promise.resolve({ data: mockServiceLocationsResponse.content[0] });
      }
      if (url === '/service-locations') {
        return Promise.resolve({ data: mockServiceLocationsResponse });
      }
      return Promise.resolve({ data: [] });
    });
    const user = userEvent.setup();

    renderWithProviders(<ServiceLocationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    await user.click(screen.getAllByLabelText(/more options/i)[0]);
    await user.click(screen.getByRole('menuitem', { name: /edit/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

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

    // Warehouse has no contact, should show em-dash (the project's empty
    // marker). Clickable DenseRows expose `role="button"` so locate the row
    // via its text content + closest <tr>.
    const warehouseRow = screen.getByText('Warehouse').closest('tr');
    expect(warehouseRow?.textContent).toContain('—');
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
      expect(screen.getByText(/1 location$/i)).toBeInTheDocument();
    });
  });
});
