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
  phone: '555-1234',
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
  serviceLocations: [
    {
      id: 'loc-1',
      customerId: '1',
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
    expect(screen.getByText(/loading customer/i)).toBeInTheDocument();
  });

  it('displays error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to load'));
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading customer/i)).toBeInTheDocument();
    });
  });

  it('displays simple view for homeowner', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText(/no equipment recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no work orders yet/i)).toBeInTheDocument();
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

    const addButton = screen.getByRole('button', { name: /add location/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Add Service Location')).toBeInTheDocument();
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

  it('uses card layout for customers with few locations', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/service locations \(2\)/i)).toBeInTheDocument();
    });

    // Should show cards not table
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByText(/view details/i).length).toBe(2);
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

    const phoneLink = screen.getByRole('link', { name: /555-1234/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:555-1234');

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
          siteContactPhone: '555-9999',
          siteContactEmail: 'jane@example.com',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithContact });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/jane manager/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/555-9999/i)).toBeInTheDocument();
  });

  it('displays location with access instructions', async () => {
    const customerWithInstructions: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockSimpleCustomer.serviceLocations[0],
          accessInstructions: 'Use back entrance, gate code 1234',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithInstructions });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/use back entrance/i)).toBeInTheDocument();
    });
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

    const addButton = screen.getByRole('button', { name: /add location/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Add Service Location')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Add Service Location')).not.toBeInTheDocument();
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
});
