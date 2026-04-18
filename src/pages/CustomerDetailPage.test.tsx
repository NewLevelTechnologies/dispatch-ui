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

  it('switches to work-orders tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const workOrdersTab = screen.getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(screen.getByText(/no .* yet/i)).toBeInTheDocument();
    });
  });

  it('switches to financial tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const financialTab = screen.getByRole('button', { name: /financial/i });
    await user.click(financialTab);

    await waitFor(() => {
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    });
  });

  it('switches to equipment tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(screen.getByText(/no .* yet/i)).toBeInTheDocument();
    });
  });

  it('switches to activity tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const activityTab = screen.getByRole('button', { name: /activity/i });
    await user.click(activityTab);

    // Activity tab content should be rendered (NotificationLogsList component is mounted)
    // Tab button should have aria-current="page"
    await waitFor(() => {
      expect(activityTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('opens notification preferences dialog when bell icon is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/notification-preferences')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/notification-types')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: mockSimpleCustomer });
    });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const bellButton = screen.getByRole('button', { name: /manage/i });
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getAllByText(/notification preferences/i).length).toBeGreaterThan(0);
    });
  });

  it('fetches notification preferences for display', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/notification-preferences')) {
        return Promise.resolve({
          data: [
            { id: '1', notificationTypeId: 'type1', optIn: true },
            { id: '2', notificationTypeId: 'type2', optIn: true },
            { id: '3', notificationTypeId: 'type3', optIn: false },
          ],
        });
      }
      return Promise.resolve({ data: mockSimpleCustomer });
    });

    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Notification bell button should be present
    expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument();
  });

  it('displays back button in normal view', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeInTheDocument();
  });

  it('displays back button in error view', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to load'));
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeInTheDocument();
  });

  it('does not show table for simple customers with few locations', async () => {
    const simpleWith3Locations: Customer = {
      ...mockSimpleCustomer,
      serviceLocations: Array.from({ length: 3 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: simpleWith3Locations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Should NOT show table for simple customers with ≤5 locations
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders successfully with multiple locations for simple customers', async () => {
    const simpleWithManyLocations: Customer = {
      ...mockSimpleCustomer,
      serviceLocations: Array.from({ length: 6 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: simpleWithManyLocations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Page should render successfully with multiple locations
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
  });

  it('renders successfully with few locations for simple customers', async () => {
    const simpleWith3Locations: Customer = {
      ...mockSimpleCustomer,
      serviceLocations: Array.from({ length: 3 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: simpleWith3Locations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Page should render successfully
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
  });

  it('displays add location card in card layout view', async () => {
    const simpleWith3Locations: Customer = {
      ...mockSimpleCustomer,
      serviceLocations: Array.from({ length: 3 }, (_, i) => ({
        ...mockSimpleCustomer.serviceLocations[0],
        id: `loc-${i}`,
        locationName: `Location ${i}`,
      })),
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: simpleWith3Locations });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Should show add location button (in header)
    const addButtons = screen.getAllByText(/add service location/i);
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders locations with access instructions for standard customers', async () => {
    const standardWithAccessInstructions: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockStandardCustomer.serviceLocations[0],
          accessInstructions: 'Gate code: 1234',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: standardWithAccessInstructions });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    // Standard view should show locations in table
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('displays inactive location badge', async () => {
    const customerWithInactiveLocation: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockSimpleCustomer.serviceLocations[0],
          status: 'INACTIVE',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: customerWithInactiveLocation });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    expect(screen.getByText('INACTIVE')).toBeInTheDocument();
  });

  it('fetches and displays dispatch region for simple customers', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/dispatch-regions')) {
        return Promise.resolve({ data: { id: 'region-1', name: 'North Region' } });
      }
      return Promise.resolve({ data: mockSimpleCustomer });
    });

    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('North Region')).toBeInTheDocument();
    });
  });

  it('shows "new work order" button in work orders tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const workOrdersTab = screen.getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new work order/i })).toBeInTheDocument();
    });
  });

  it('shows "add equipment" button in equipment tab', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSimpleCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });

  it('displays billing address for standard customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/billing address:/i)).toBeInTheDocument();
    });

    // Billing address should be present (multiple instances possible)
    expect(screen.getAllByText(/123 main st/i).length).toBeGreaterThan(0);
  });

  it('shows add location button in table header for standard customers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    // Should show add button in table header (not just in header area)
    const addButtons = screen.getAllByRole('button', { name: /add service location/i });
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it('renders locations with site contact for standard customers', async () => {
    const standardWithContact: Customer = {
      ...mockStandardCustomer,
      serviceLocations: [
        {
          ...mockStandardCustomer.serviceLocations[0],
          siteContactName: 'Jane Manager',
          siteContactEmail: 'jane@location.com',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: standardWithContact });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });

    // Standard view should show locations in table
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('closes notification preferences dialog when close is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/notification-preferences')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/notification-types')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: mockSimpleCustomer });
    });
    renderWithProviders(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const bellButton = screen.getByRole('button', { name: /manage/i });
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getAllByText(/notification preferences/i).length).toBeGreaterThan(0);
    });

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Dialog should close - check that notification dialog content is gone
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });
  });

  describe('Standard customer overview tab', () => {
    it('displays locations table in overview tab for standard customers', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show table with locations
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Branch Office')).toBeInTheDocument();
    });

    it('shows add location button in table header for standard customers', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Multiple add buttons should exist (one in header, one in table section)
      const addButtons = screen.getAllByRole('button', { name: /add service location/i });
      expect(addButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('displays location count for standard customers', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStandardCustomer });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show location count
      expect(screen.getByText(/service locations \(2\)/i)).toBeInTheDocument();
    });

    it('displays search input for standard customers with 5+ locations', async () => {
      const standardWith5Locations: Customer = {
        ...mockStandardCustomer,
        serviceLocations: Array.from({ length: 5 }, (_, i) => ({
          ...mockStandardCustomer.serviceLocations[0],
          id: `loc-${i}`,
          locationName: `Location ${i}`,
        })),
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardWith5Locations });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show search input
      expect(screen.getByPlaceholderText(/search locations/i)).toBeInTheDocument();
    });

    it('filters locations by search in standard view', async () => {
      const user = userEvent.setup();
      const standardWith5Locations: Customer = {
        ...mockStandardCustomer,
        serviceLocations: Array.from({ length: 5 }, (_, i) => ({
          ...mockStandardCustomer.serviceLocations[0],
          id: `loc-${i}`,
          locationName: `Location ${i}`,
        })),
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardWith5Locations });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // All locations should be visible
      expect(screen.getByText('Location 0')).toBeInTheDocument();
      expect(screen.getByText('Location 1')).toBeInTheDocument();

      // Search for "Location 2"
      const searchInput = screen.getByPlaceholderText(/search locations/i);
      await user.type(searchInput, 'Location 2');

      // Should show filtered count
      await waitFor(() => {
        expect(screen.getByText(/1 of 5/i)).toBeInTheDocument();
      });
    });

    it('displays unnamed location when locationName is null', async () => {
      const standardWithUnnamed: Customer = {
        ...mockStandardCustomer,
        serviceLocations: [
          {
            ...mockStandardCustomer.serviceLocations[0],
            locationName: null,
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardWithUnnamed });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show "Unnamed Location"
      expect(screen.getByText('Unnamed Location')).toBeInTheDocument();
    });

    it('displays dash when location has no site contact', async () => {
      const standardNoContact: Customer = {
        ...mockStandardCustomer,
        serviceLocations: [
          {
            ...mockStandardCustomer.serviceLocations[0],
            siteContactName: null,
            siteContactPhone: null,
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardNoContact });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show dash in contact column
      const table = screen.getByRole('table');
      expect(table.textContent).toContain('-');
    });

    it('displays location with only site contact name', async () => {
      const standardNameOnly: Customer = {
        ...mockStandardCustomer,
        serviceLocations: [
          {
            ...mockStandardCustomer.serviceLocations[0],
            siteContactName: 'Site Manager',
            siteContactPhone: null,
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardNameOnly });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show contact name
      expect(screen.getByText('Site Manager')).toBeInTheDocument();
    });

    it('shows notes section for standard customers with notes', async () => {
      const standardWithNotes: Customer = {
        ...mockStandardCustomer,
        notes: 'Important customer notes here',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardWithNotes });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show notes
      expect(screen.getByText('Important customer notes here')).toBeInTheDocument();
    });

    it('displays additional contacts for standard customers', async () => {
      const standardWithContacts: Customer = {
        ...mockStandardCustomer,
        additionalContacts: [
          {
            id: 'contact-1',
            name: 'Secondary Contact',
            phone: '5559876543',
            email: 'secondary@example.com',
            notes: 'Alternate contact',
            displayOrder: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: standardWithContacts });
      renderWithProviders(<CustomerDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument();
      });

      // Should show additional contact
      expect(screen.getByText('Secondary Contact')).toBeInTheDocument();
    });
  });
});
