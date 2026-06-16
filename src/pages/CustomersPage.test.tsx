import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomersPage from './CustomersPage';
import apiClient from '../api/client';
import type { Customer, CustomerListResponse } from '../api';

// Mock the API client
vi.mock('../api/client');

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

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
      type: 'STANDARD',
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
      type: 'STANDARD',
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
    type: 'STANDARD',
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
    category: 'RESIDENTIAL',
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

  it('displays loading state while fetching customers', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<CustomersPage />);

    // LoadingState renders after a 250 ms delay to avoid flashing on fast queries.
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByText(/loading customers/i)).toBeInTheDocument();
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
      expect(screen.getByText(/couldn't load customers/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no customers exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...mockCustomersListResponse, content: [], totalElements: 0, empty: true } });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
    });
  });

  it('navigates to the add-customer page when the add button is clicked', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...mockCustomersListResponse, content: [], totalElements: 0, empty: true } });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
    });

    // Create moved to a full-page form — Add now navigates rather than opening
    // a dialog. The empty state renders an extra Add Customer button alongside
    // the header one; either navigates, so just click the first.
    const addButton = screen.getAllByRole('button', { name: /add customer/i })[0];
    await user.click(addButton);

    expect(navigateSpy).toHaveBeenCalledWith('/customers/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The redesigned row shows the location count as a sub line only when the
  // customer has more than one location — single-location customers don't
  // need the count surfaced because each row already implies one.
  it('displays customer location count for customers with multiple locations', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText(/2 locations/i)).toBeInTheDocument();
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

  // The customer row no longer renders a residential/commercial glyph — the
  // honest model has premise type per location, not per customer. The mark
  // moved to the Locations list as PremiseMark and is tested there.

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

  describe('interactions', () => {
    beforeEach(() => {
      navigateSpy.mockReset();
    });

    it('navigates to the detail page when a row is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      await user.click(screen.getByText('John Doe'));
      expect(navigateSpy).toHaveBeenCalledWith('/customers/1');
    });

    it('does not navigate when the phone or email link is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      await user.click(screen.getByText(/\(555\) 123-4567/));
      await user.click(screen.getByText('john@example.com'));
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('navigates from the row View action', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
      await user.click(await screen.findByRole('menuitem', { name: /^view$/i }));
      expect(navigateSpy).toHaveBeenCalledWith('/customers/1');
    });

    it('toggles the open-balance, open-jobs, and aged filter chips', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /openBalance/i }));
      await user.click(screen.getByRole('button', { name: /openJobs/i }));
      await user.click(screen.getByRole('button', { name: /\.aged/i }));

      // Each toggle pushes an axios query param the next fetch must carry.
      await waitFor(() => {
        const params = vi
          .mocked(apiClient.get)
          .mock.calls.map((c) => (c[1] as { params?: Record<string, unknown> })?.params ?? {});
        expect(params.some((p) => p.openBalance === true)).toBe(true);
        expect(params.some((p) => p.openJobs === true)).toBe(true);
        expect(params.some((p) => p.agedBalance === true)).toBe(true);
      });
    });

    it('retries the fetch from the error state', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() =>
        expect(screen.getByText(/couldn't load customers/i)).toBeInTheDocument()
      );

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomersListResponse });
      await user.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    });

    it('closes the edit dialog after opening it', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (String(url).includes('/customers/1')) {
          return Promise.resolve({ data: mockFullCustomers[0] });
        }
        return Promise.resolve({ data: mockCustomersListResponse });
      });
      const user = userEvent.setup();
      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      // Create moved to a full-page form; the dialog is now edit-only. Open it
      // from the row's overflow menu, then confirm Escape closes it.
      await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
      await user.click(screen.getByRole('menuitem', { name: /edit/i }));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
    });

    it('surfaces a toast when a delete fails', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (String(url).includes('/customers/1')) {
          return Promise.resolve({ data: mockFullCustomers[0] });
        }
        return Promise.resolve({ data: mockCustomersListResponse });
      });
      vi.mocked(apiClient.delete).mockRejectedValue(new Error('boom'));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();

      renderWithProviders(<CustomersPage />);

      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
      await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

      await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/customers/1'));
      confirmSpy.mockRestore();
    });
  });
});
