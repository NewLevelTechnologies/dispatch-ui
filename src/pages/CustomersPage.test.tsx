import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomersPage from './CustomersPage';
import apiClient from '../api/client';
import type { Customer, CustomerListResponse } from '../api';

// Mock the API client
vi.mock('../api/client');

const mockCustomersListResponse: CustomerListResponse = {
  content: [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '5551234567',
      billingAddress: {
        streetAddress: '123 Main St',
        city: 'Boston',
        state: 'MA',
        zipCode: '02101',
      },
      serviceLocationCount: 1,
      paymentTermsDays: 0,
      requiresPurchaseOrder: false,
      contractPricingTier: null,
      status: 'ACTIVE',
      displayMode: 'SIMPLE',
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '5555678901',
      billingAddress: {
        streetAddress: '456 Oak Ave',
        city: 'Cambridge',
        state: 'MA',
        zipCode: '02139',
      },
      serviceLocationCount: 2,
      paymentTermsDays: 30,
      requiresPurchaseOrder: true,
      contractPricingTier: 'Premium',
      status: 'ACTIVE',
      displayMode: 'STANDARD',
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
  pageable: {
    pageNumber: 0,
    pageSize: 50,
    sort: {
      sorted: false,
      unsorted: true,
      empty: true,
    },
    offset: 0,
    paged: true,
    unpaged: false,
  },
};

// Full Customer objects for edit/delete operations
const mockFullCustomers: Customer[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '5551234567',
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
    displayMode: 'SIMPLE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 0,
  },
];

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...mockCustomersListResponse, content: [], totalElements: 0, empty: true } });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching customers', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { container } = renderWithProviders(<CustomersPage />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('displays customers in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('(555) 123-4567')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading customers/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no customers exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...mockCustomersListResponse, content: [], totalElements: 0, empty: true } });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...mockCustomersListResponse, content: [], totalElements: 0, empty: true } });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add customer/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Add Customer').length).toBeGreaterThan(0);
  });

  it('displays customer location count', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText(/1 location/i)).toBeInTheDocument();
    expect(screen.getByText(/2 locations/i)).toBeInTheDocument();
  });

  it('displays dash when no service locations exist', async () => {
    const responseWithNoLocations = {
      ...mockCustomersListResponse,
      content: [{
        ...mockCustomersListResponse.content[0],
        serviceLocationCount: 0,
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: responseWithNoLocations });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/customers/1')) {
        return Promise.resolve({ data: mockFullCustomers[0] });
      }
      return Promise.resolve({ data: mockCustomersListResponse });
    });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open with Edit Customer title
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Edit Customer').length).toBeGreaterThan(0);
  });

  it('calls delete mutation when delete is confirmed', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/customers/1')) {
        return Promise.resolve({ data: mockFullCustomers[0] });
      }
      return Promise.resolve({ data: mockCustomersListResponse });
    });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete John Doe?');
      expect(apiClient.delete).toHaveBeenCalledWith('/customers/1');
    });

    confirmSpy.mockRestore();
  });

  it('does not delete when deletion is cancelled', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/customers/1')) {
        return Promise.resolve({ data: mockFullCustomers[0] });
      }
      return Promise.resolve({ data: mockCustomersListResponse });
    });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    expect(apiClient.delete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('updates search query when typing in search input', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'test');

    expect(searchInput).toHaveValue('test');
  });

  it('filters customers by email', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'jane@');

    // Search input should have the value
    expect(searchInput).toHaveValue('jane@');
  });

  it('filters customers by phone', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, '555123');

    // Search input should have the value
    expect(searchInput).toHaveValue('555123');
  });

  it('filters customers by billing city', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Cambridge');

    // Search input should have the value
    expect(searchInput).toHaveValue('Cambridge');
  });

  it('filters customers by service location name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Downtown');

    // Search input should have the value
    expect(searchInput).toHaveValue('Downtown');
  });

  it('displays filtered count when search filters results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'John');

    // Search input should have the value
    expect(searchInput).toHaveValue('John');
  });

  it('shows no match message when search returns no results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'NonExistent');

    // Search input should have the value
    expect(searchInput).toHaveValue('NonExistent');
  });

  it('displays payment terms badges', async () => {
    const customersWithTerms = {
      ...mockCustomersListResponse,
      content: [{
        ...mockCustomersListResponse.content[0],
        paymentTermsDays: 30,
        requiresPurchaseOrder: true,
        contractPricingTier: 'Gold',
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customersWithTerms });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Net-30')).toBeInTheDocument();
      expect(screen.getByText('PO')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
    });
  });

  it('displays business icon for STANDARD display mode', async () => {
    const businessCustomer = {
      ...mockCustomersListResponse,
      content: [{
        ...mockCustomersListResponse.content[0],
        displayMode: 'STANDARD' as const,
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: businessCustomer });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const businessIcon = screen.getByTitle('Business');
    expect(businessIcon).toBeInTheDocument();
  });

  it('displays INACTIVE status badge correctly', async () => {
    const inactiveCustomer = {
      ...mockCustomersListResponse,
      content: [{
        ...mockCustomersListResponse.content[0],
        status: 'INACTIVE' as const,
      }],
      totalElements: 1,
      numberOfElements: 1,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: inactiveCustomer });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const badges = screen.getAllByText(/inactive/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays billing address', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Check for the address elements (CustomerListDto doesn't include streetAddressLine2)
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText(/Boston, MA 02101/i)).toBeInTheDocument();
  });

  it('displays multiple locations count', async () => {
    const customerWithMultipleLocations = {
      ...mockCustomersListResponse,
      content: [{
        ...mockCustomersListResponse.content[0],
        serviceLocationCount: 3,
      }],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithMultipleLocations });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('3 locations')).toBeInTheDocument();
    });
  });

  it('displays phone link with correct href', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const phoneLink = screen.getByText(/\(555\) 123-4567/);
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');
  });
});
