import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomersPage from './CustomersPage';
import apiClient from '../api/client';
import type { Customer } from '../api';

// Mock the API client
vi.mock('../api/client');

const mockCustomers: Customer[] = [
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
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '5555678901',
    billingAddress: {
      streetAddress: '456 Oak Ave',
      streetAddressLine2: null,
      city: 'Cambridge',
      state: 'MA',
      zipCode: '02139',
      country: 'US',
      validated: true,
      validatedAt: '2024-01-01T00:00:00Z',
      dpvConfirmation: 'Y',
      isBusiness: false,
    },
    additionalContacts: [],
    serviceLocations: [
      {
        id: 'loc-2',
        customerId: '2',
        dispatchRegionId: 'region-1',
        locationName: null,
        address: {
          streetAddress: '456 Oak Ave',
          streetAddressLine2: null,
          city: 'Cambridge',
          state: 'MA',
          zipCode: '02139',
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching customers', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<CustomersPage />);

    expect(screen.getByText('Loading customers...')).toBeInTheDocument();
  });

  it('displays customers in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

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
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
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

  it('displays customer location in correct format', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Boston, MA')).toBeInTheDocument();
    });

    expect(screen.getByText('Cambridge, MA')).toBeInTheDocument();
  });

  it('displays dash when no service locations exist', async () => {
    const customerWithoutLocation: Customer = {
      ...mockCustomers[0],
      serviceLocations: [],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithoutLocation] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Table should show dash for missing location
    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Edit Customer').length).toBeGreaterThan(0);
  });

  it('calls delete mutation when delete is confirmed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
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

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('updates search query when typing in search input', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'test');

    expect(searchInput).toHaveValue('test');
  });

  it('filters customers by email', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'jane@');

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('filters customers by phone', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, '555123');

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });
  });

  it('filters customers by billing city', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Cambridge');

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('filters customers by service location name', async () => {
    const customersWithLocationNames: Customer[] = [
      {
        ...mockCustomers[0],
        serviceLocations: [
          {
            ...mockCustomers[0].serviceLocations[0],
            locationName: 'Downtown Office',
          },
        ],
      },
      mockCustomers[1],
    ];

    vi.mocked(apiClient.get).mockResolvedValue({ data: customersWithLocationNames });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Downtown');

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });
  });

  it('displays filtered count when search filters results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'John');

    await waitFor(() => {
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });
  });

  it('shows no match message when search returns no results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'NonExistent');

    await waitFor(() => {
      expect(screen.getByText(/no customers match your search/i)).toBeInTheDocument();
    });
  });

  it('displays payment terms badges', async () => {
    const customersWithTerms: Customer[] = [
      {
        ...mockCustomers[0],
        paymentTermsDays: 30,
        requiresPurchaseOrder: true,
        contractPricingTier: 'Gold',
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValue({ data: customersWithTerms });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Net-30')).toBeInTheDocument();
      expect(screen.getByText('PO')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
    });
  });

  it('displays business icon for STANDARD display mode', async () => {
    const businessCustomer: Customer = {
      ...mockCustomers[0],
      displayMode: 'STANDARD',
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [businessCustomer] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const businessIcon = screen.getByTitle('Business');
    expect(businessIcon).toBeInTheDocument();
  });

  it('displays INACTIVE status badge correctly', async () => {
    const inactiveCustomer: Customer = {
      ...mockCustomers[0],
      status: 'INACTIVE',
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [inactiveCustomer] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });

  it('displays billing address line 2 when present', async () => {
    const customerWithLine2: Customer = {
      ...mockCustomers[0],
      billingAddress: {
        ...mockCustomers[0].billingAddress,
        streetAddressLine2: 'Apt 5B',
      },
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithLine2] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/123 Main St Apt 5B/)).toBeInTheDocument();
    });
  });

  it('displays multiple locations count', async () => {
    const customerWithMultipleLocations: Customer = {
      ...mockCustomers[0],
      serviceLocations: [
        mockCustomers[0].serviceLocations[0],
        {
          ...mockCustomers[0].serviceLocations[0],
          id: 'loc-2',
          address: { ...mockCustomers[0].serviceLocations[0].address, city: 'Cambridge' },
        },
        {
          ...mockCustomers[0].serviceLocations[0],
          id: 'loc-3',
          address: { ...mockCustomers[0].serviceLocations[0].address, city: 'Somerville' },
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithMultipleLocations] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('3 locations')).toBeInTheDocument();
    });
  });

  it('displays phone link with correct href', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const phoneLink = screen.getByText(/\(555\) 123-4567/);
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');
  });
});
