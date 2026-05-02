import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationPicker from './ServiceLocationPicker';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockSearchResults = {
  content: [
    {
      id: 'location-1',
      customerId: 'customer-1',
      customerName: 'John Doe',
      locationName: "John's House",
      address: {
        streetAddress: '123 Main St',
        city: 'Atlanta',
        state: 'GA',
        zipCode: '30301',
      },
      siteContactName: 'John Doe',
      siteContactPhone: '5551234567',
      status: 'ACTIVE' as const,
    },
    {
      id: 'location-2',
      customerId: 'customer-2',
      customerName: 'Jane Smith',
      locationName: null,
      address: {
        streetAddress: '456 Oak Ave',
        city: 'Marietta',
        state: 'GA',
        zipCode: '30060',
      },
      siteContactName: null,
      siteContactPhone: null,
      status: 'ACTIVE' as const,
    },
  ],
  totalElements: 2,
  totalPages: 1,
  size: 50,
  number: 0,
};

describe('ServiceLocationPicker', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with label and placeholder', () => {
    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
        label="Service Location"
      />
    );

    expect(screen.getByLabelText('Service Location')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by customer, address, or phone...')).toBeInTheDocument();
  });

  it('shows minimum character message when typing less than 2 characters', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'a');

    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();
  });

  it('performs debounced search after typing 2+ characters', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'john');

    // Wait for debounce (300ms) and API call
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/service-locations/search', {
        params: { q: 'john', page: 0, size: 50 },
      });
    });
  });

  it('displays search results in dropdown', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'john');

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    expect(screen.getByText('123 Main St, Atlanta, GA 30301')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave, Marietta, GA 30060')).toBeInTheDocument();
  });

  it('shows customer name when location name is null', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'jane');

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('shows loading state while searching', async () => {
    const user = userEvent.setup();
    // Delay the API response to see loading state
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: mockSearchResults }), 100))
    );

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'test');

    // Should show loading after debounce
    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });
  });

  it('shows "no locations found" when search returns empty results', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { content: [], totalElements: 0, totalPages: 0, size: 50, number: 0 },
    });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText('No locations found')).toBeInTheDocument();
    });
  });

  it('calls onChange when location is selected', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'john');

    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    // Click on the first result
    const firstResult = screen.getByText("John's House").closest('button');
    await user.click(firstResult!);

    expect(mockOnChange).toHaveBeenCalledWith(mockSearchResults.content[0]);
  });

  it('displays selected location value', () => {
    const selectedLocation = mockSearchResults.content[0];

    renderWithProviders(
      <ServiceLocationPicker
        value={selectedLocation}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    expect(input).toHaveValue("John's House - 123 Main St, Atlanta, GA");
  });

  it('clears search query on focus to allow new search', async () => {
    const user = userEvent.setup();
    const selectedLocation = mockSearchResults.content[0];

    renderWithProviders(
      <ServiceLocationPicker
        value={selectedLocation}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    expect(input).toHaveValue("John's House - 123 Main St, Atlanta, GA");

    // Focus clears searchQuery (triggers onFocus handler)
    await user.click(input);

    // The input still shows displayValue until user starts typing
    // This is expected behavior - we clear searchQuery but displayValue remains
    expect(input).toHaveValue("John's House - 123 Main St, Atlanta, GA");
  });

  it('marks field as required when required prop is true', () => {
    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
        label="Service Location"
        required
      />
    );

    expect(screen.getByLabelText(/Service Location \*/)).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    expect(input).toBeRequired();
  });

  it('autofocuses input when autoFocus prop is true', () => {
    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
        autoFocus
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    expect(input).toHaveFocus();
  });

  it('does not trigger search for queries less than 2 characters', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'a');

    // Wait longer than debounce time
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('closes dropdown when location is selected', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'john');

    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    const firstResult = screen.getByText("John's House").closest('button');
    await user.click(firstResult!);

    // Dropdown should close after selection
    await waitFor(() => {
      expect(screen.queryByText("John's House")).not.toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'test');

    // Should not crash, just show no results
    await waitFor(() => {
      expect(screen.getByText('No locations found')).toBeInTheDocument();
    });
  });

  it('calls onChange with formatted location when location name is present', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'john');

    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    const firstResult = screen.getByText("John's House").closest('button');
    await user.click(firstResult!);

    // Should call onChange with the selected location
    expect(mockOnChange).toHaveBeenCalledWith(mockSearchResults.content[0]);

    // Input should be cleared after selection (searchQuery is reset)
    expect(input).toHaveValue('');
  });

  it('calls onChange with formatted location when location name is null', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'jane');

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    const secondResult = screen.getByText('Jane Smith').closest('button');
    await user.click(secondResult!);

    // Should call onChange with the selected location
    expect(mockOnChange).toHaveBeenCalledWith(mockSearchResults.content[1]);

    // Input should be cleared after selection (searchQuery is reset)
    expect(input).toHaveValue('');
  });

  it('does not show dropdown when typing only 1 character', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');
    await user.type(input, 'j');

    // Should show minimum character message
    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();

    // Should not make API call
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(apiClient.get).not.toHaveBeenCalled();

    // Should not show dropdown results
    expect(screen.queryByText("John's House")).not.toBeInTheDocument();
  });

  it('allows user to search again after selecting a value', async () => {
    const user = userEvent.setup();
    const selectedLocation = mockSearchResults.content[0];

    renderWithProviders(
      <ServiceLocationPicker
        value={selectedLocation}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');

    // Should show formatted value initially
    expect(input).toHaveValue("John's House - 123 Main St, Atlanta, GA");

    // Focus triggers onFocus handler that clears searchQuery
    await user.click(input);

    // Type new search - should override the display value
    await user.type(input, 'test');

    // Input should now show the new search text appended
    // (Since displayValue is shown when searchQuery is empty, typing adds to it)
    expect((input as HTMLInputElement).value).toContain('test');
  });

  it('handles rapid typing with debounce correctly', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');

    // Type quickly
    await user.type(input, 'jo');

    // Should not call API immediately
    expect(apiClient.get).not.toHaveBeenCalled();

    // Wait for debounce
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/service-locations/search', {
        params: { q: 'jo', page: 0, size: 50 },
      });
    });

    // Should only call API once after debounce delay
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  describe('restrictToCustomer mode', () => {
    const customerLocations = [
      {
        id: 'loc-1',
        customerId: 'customer-1',
        dispatchRegionId: 'r1',
        locationName: 'Main Office',
        address: {
          streetAddress: '123 Main St',
          city: 'Atlanta',
          state: 'GA',
          zipCode: '30301',
        },
        additionalContacts: [],
        status: 'ACTIVE' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        version: 1,
      },
      {
        id: 'loc-2',
        customerId: 'customer-1',
        dispatchRegionId: 'r1',
        locationName: null,
        address: {
          streetAddress: '999 Side Rd',
          city: 'Marietta',
          state: 'GA',
          zipCode: '30060',
        },
        additionalContacts: [],
        status: 'ACTIVE' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        version: 1,
      },
    ];

    it('fetches the customer service-locations endpoint, not the tenant search', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      await user.click(screen.getByRole('textbox'));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers/customer-1/service-locations');
      });
      expect(apiClient.get).not.toHaveBeenCalledWith(
        '/service-locations/search',
        expect.anything()
      );
    });

    it('opens the dropdown on focus with no minimum character requirement', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      await user.click(screen.getByRole('textbox'));

      await waitFor(() => {
        expect(screen.getByText('Main Office')).toBeInTheDocument();
      });
      expect(screen.getByText('999 Side Rd, Marietta, GA 30060')).toBeInTheDocument();
    });

    it('filters the customer locations client-side as the user types', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

      await user.type(input, 'side');

      await waitFor(() => {
        expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
      });
      expect(screen.getByText('999 Side Rd, Marietta, GA 30060')).toBeInTheDocument();
    });

    it('does not show the "type at least 2 characters" hint', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'a');

      expect(screen.queryByText('Type at least 2 characters to search')).not.toBeInTheDocument();
    });

    it('calls onChange with an adapted summary that includes the customer name from the prop', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      await user.click(screen.getByRole('textbox'));
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByText('Main Office').closest('button')!);

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'loc-1',
          customerId: 'customer-1',
          customerName: 'Acme Inc',
          locationName: 'Main Office',
        })
      );
    });

    it('coerces a CLOSED service location status to INACTIVE in the adapted summary', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [
          {
            ...customerLocations[0],
            status: 'CLOSED',
          },
        ],
      });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      await user.click(screen.getByRole('textbox'));
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByText('Main Office').closest('button')!);

      // ServiceLocationSearchResult only accepts ACTIVE | INACTIVE; CLOSED maps to INACTIVE
      // so downstream consumers don't have to handle a third state.
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'INACTIVE' })
      );
    });

    it('shows an empty-results message when the customer has no locations matching the filter', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: customerLocations });

      renderWithProviders(
        <ServiceLocationPicker
          value={null}
          onChange={mockOnChange}
          restrictToCustomer={{ id: 'customer-1', name: 'Acme Inc' }}
        />
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'zzzznomatch');

      await waitFor(() => {
        expect(screen.getByText('No locations found')).toBeInTheDocument();
      });
    });
  });

  it('updates dropdown visibility when search query changes length', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSearchResults });

    renderWithProviders(
      <ServiceLocationPicker
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByPlaceholderText('Search by customer, address, or phone...');

    // Type 1 character - no dropdown
    await user.type(input, 'j');
    expect(screen.queryByText('Searching...')).not.toBeInTheDocument();

    // Type second character - show dropdown
    await user.type(input, 'o');
    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    // Clear input - hide dropdown
    await user.clear(input);
    await waitFor(() => {
      expect(screen.queryByText("John's House")).not.toBeInTheDocument();
    });
  });
});
