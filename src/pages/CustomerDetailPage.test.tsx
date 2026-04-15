import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomerDetailPage from './CustomerDetailPage';
import apiClient from '../api/client';
import type { Customer } from '../api';

vi.mock('../api/client');

const mockSimpleCustomer: Customer = {
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
      locationName: 'Home',
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
};

const mockStandardCustomer: Customer = {
  ...mockSimpleCustomer,
  displayMode: 'STANDARD',
  serviceLocations: [
    ...mockSimpleCustomer.serviceLocations,
    {
      ...mockSimpleCustomer.serviceLocations[0],
      id: 'loc-2',
      locationName: 'Branch Office',
    },
  ],
};

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<CustomerDetailPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to load'));
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });

  it('displays simple view for homeowner', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Check that tabs are present
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /work order/i })).toBeInTheDocument();
  });

  it('displays standard view for business', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/service locations \(2\)/i)).toBeInTheDocument();
  });

  it('opens edit dialog when edit button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Customer')).toBeInTheDocument();
    });
  });

  it('opens add location dialog when add location is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Button now says "Add Service Location" (from glossary)
    const addButton = screen.getByRole('button', { name: /add service location/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Create Service Location')).toBeInTheDocument();
    });
  });

  it('uses table layout for customers with many locations', async () => {
    const customerWithManyLocations: Customer = {
      ...mockStandardCustomer,
      serviceLocations: Array.from({ length: 10 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(10\)/i)).toBeInTheDocument();
    });

    // Should show table instead of cards
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search locations/i)).toBeInTheDocument();
  });

  it('filters locations in table view', async () => {
    const user = userEvent.setup();
    const customerWithManyLocations: Customer = {
      ...mockStandardCustomer,
      serviceLocations: Array.from({ length: 10 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(10\)/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search locations/i);
    await user.type(searchInput, 'Location 5');

    await waitFor(() => {
      expect(screen.getByText(/1 of 10/i)).toBeInTheDocument();
    });
  });

  it('uses table layout for standard customers regardless of location count', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(2\)/i)).toBeInTheDocument();
    });

    // Standard customers always use table layout (more CSR-friendly)
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('displays payment terms badges for standard customers', async () => {
    const customerWithTerms: Customer = {
      ...mockStandardCustomer,
      paymentTermsDays: 30,
      requiresPurchaseOrder: true,
      contractPricingTier: 'GOLD',
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithTerms });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/net-30/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/requires po/i)).toBeInTheDocument();
    expect(screen.getByText(/gold/i)).toBeInTheDocument();
  });

  it('displays customer with notes', async () => {
    const customerWithNotes: Customer = {
      ...mockSimpleCustomer,
      notes: 'VIP customer - handle with care',
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithNotes });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/vip customer/i)).toBeInTheDocument();
    });
  });

  it('displays clickable email and phone links', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const phoneLink = screen.getByRole('link', { name: /\(555\) 123-4567/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');

    const emailLink = screen.getByRole('link', { name: /john@example.com/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('displays location with site contact information', async () => {
    const customerWithContact: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockSimpleCustomer.serviceLocations[0],
          siteContactName: 'Jane Manager',
          siteContactPhone: '5559999999',
          siteContactEmail: 'jane@example.com',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithContact });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/jane manager/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/\(555\) 999-9999/i)).toBeInTheDocument();
  });

  it('displays customer without phone number', async () => {
    const customerNoPhone: Customer = {
      ...mockSimpleCustomer,
      phone: null,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerNoPhone });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/no phone/i)).toBeInTheDocument();
    });
  });

  it('displays location with address line 2', async () => {
    const customerWithApt: Customer = {
      ...mockSimpleCustomer,
      serviceLocations: [
        {
          ...mockSimpleCustomer.serviceLocations[0],
          address: {
            ...mockSimpleCustomer.serviceLocations[0].address,
            streetAddressLine2: 'Apt 5B',
          },
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithApt });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/apt 5b/i)).toBeInTheDocument();
    });
  });

  it('closes add location dialog on close', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Button now says "Add Service Location" (from glossary)
    const addButton = screen.getByRole('button', { name: /add service location/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Create Service Location')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Create Service Location')).not.toBeInTheDocument();
    });
  });

  it('closes edit dialog on close', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Customer')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Edit Customer')).not.toBeInTheDocument();
    });
  });

  it('displays tax exempt badge', async () => {
    const customerTaxExempt: Customer = {
      ...mockStandardCustomer,
      taxExempt: true,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerTaxExempt });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/tax exempt/i)).toBeInTheDocument();
    });
  });

  it('filters locations by address', async () => {
    const user = userEvent.setup();
    const customerWithManyLocations: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockSimpleCustomer.serviceLocations[0],
          id: 'loc-1',
          locationName: 'Boston Office',
          address: { ...mockSimpleCustomer.serviceLocations[0].address, city: 'Boston' },
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          ...mockSimpleCustomer.serviceLocations[0],
          id: `loc-${i + 2}`,
          locationName: `Location ${i + 2}`,
          address: { ...mockSimpleCustomer.serviceLocations[0].address, city: 'Cambridge' },
        })),
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(10\)/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search locations/i);
    await user.type(searchInput, 'Boston');

    await waitFor(() => {
      expect(screen.getByText(/1 of 10/i)).toBeInTheDocument();
    });
  });

  it('filters locations by contact name', async () => {
    const user = userEvent.setup();
    const customerWithManyLocations: Customer = {
      ...mockStandardCustomer,
      serviceLocations: Array.from({ length: 10 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
        siteContactName: i === 5 ? 'Jane Doe' : 'John Smith',
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(10\)/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search locations/i);
    await user.type(searchInput, 'Jane');

    await waitFor(() => {
      expect(screen.getByText(/1 of 10/i)).toBeInTheDocument();
    });
  });

  it('clears location filter when search is cleared', async () => {
    const user = userEvent.setup();
    const customerWithManyLocations: Customer = {
      ...mockStandardCustomer,
      serviceLocations: Array.from({ length: 10 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(10\)/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search locations/i);
    await user.type(searchInput, 'Location 5');

    await waitFor(() => {
      expect(screen.getByText(/1 of 10/i)).toBeInTheDocument();
    });

    await user.clear(searchInput);

    await waitFor(() => {
      expect(screen.queryByText(/of 10/i)).not.toBeInTheDocument();
    });
  });

  it('displays additional contacts section', async () => {
    const customerWithContacts: Customer = {
      ...mockSimpleCustomer,
      additionalContacts: [
        {
          id: 'contact-1',
          name: 'Jane Smith',
          phone: '5551234567',
          email: 'jane@example.com',
          notes: 'Primary contact',
          displayOrder: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithContacts });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/\(555\) 123-4567/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
  });

  it('shows add additional contact button for simple customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('shows add additional contact button for standard customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('opens add contact dialog when button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add additional contact/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/create additional contact/i)).toBeInTheDocument();
    });
  });

  it('displays compact stats bar for simple customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Simple view should have inline stats with "Status:"
    expect(screen.getByText(/status:/i)).toBeInTheDocument();
    expect(screen.getByText(/last service:/i)).toBeInTheDocument();
  });

  it('displays large numbers for standard customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    // Standard view should not have inline style with colons
    expect(screen.queryByText(/status:/i)).not.toBeInTheDocument();
  });
});
