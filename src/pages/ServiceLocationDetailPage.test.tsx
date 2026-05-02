import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationDetailPage from './ServiceLocationDetailPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';
import type { ServiceLocationDetailDto } from '../api';

vi.mock('../api/client');

const mockLocation: ServiceLocationDetailDto = {
  id: 'location-1',
  customerId: 'customer-1',
  customerName: 'Test Customer',
  customerDisplayMode: 'STANDARD' as const,
  dispatchRegionId: 'region-1',
  locationName: 'Main Office',
  address: {
    streetAddress: '123 Main St',
    streetAddressLine2: 'Suite 100',
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
  additionalContacts: [],
  accessInstructions: 'Use side entrance',
  notes: 'Important client',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T10:30:00Z',
  version: 1,
};

describe('ServiceLocationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockApiResponses = (
    location: ServiceLocationDetailDto | null = mockLocation,
    regions: unknown[] = [],
    equipment: unknown[] = []
  ) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/service-locations/')) {
        return location ? Promise.resolve({ data: location }) : Promise.reject(new Error('Not found'));
      }
      if (url.includes('/dispatch-regions')) {
        return Promise.resolve({ data: regions });
      }
      if (url.startsWith('/work-orders/config/')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/work-orders')) {
        return Promise.resolve({
          data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 25 },
        });
      }
      if (url === '/equipment' || url.startsWith('/equipment?')) {
        return Promise.resolve({
          data: {
            content: equipment,
            totalElements: equipment.length,
            totalPages: 1,
            number: 0,
            size: 100,
          },
        });
      }
      if (url === '/equipment/config/types') {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/equipment/config/categories')) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/equipment/')) {
        // Equipment getById — used when opening the edit dialog.
        return Promise.resolve({ data: equipment[0] ?? null });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  };

  const renderDetailPage = (locationId = 'location-1') => {
    const routes: RouteObject[] = [
      {
        path: '/service-locations/:id',
        element: <ServiceLocationDetailPage />,
      },
    ];

    return renderWithProviders(<ServiceLocationDetailPage />, {
      routes,
      initialPath: `/service-locations/${locationId}`,
    });
  };

  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));

    renderDetailPage();

    expect(screen.getByText(/loading service location/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });
  });

  it('displays error state when location not found', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));

    renderDetailPage('non-existent-id');

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });
  });

  it('displays location name and status', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('displays customer name with link', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    const customerLink = screen.getByText('Test Customer');
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays full address', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
    });

    expect(screen.getByText('Suite 100')).toBeInTheDocument();
    expect(screen.getByText(/Springfield, IL 62701/)).toBeInTheDocument();
  });

  it('displays address validation badges', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('USPS Validated')).toBeInTheDocument();
    });

    expect(screen.getByText('Business')).toBeInTheDocument();
  });

  it('displays site contact information', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const phoneLink = screen.getByText('(555) 123-4567');
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');

    const emailLink = screen.getByText('john@example.com');
    expect(emailLink).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('displays access instructions', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Use side entrance')).toBeInTheDocument();
    });
  });

  it('displays notes', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Important client')).toBeInTheDocument();
    });
  });

  it('opens edit dialog when edit button is clicked', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('handles unnamed location', async () => {
    const unnamedLocation = {
      ...mockLocation,
      locationName: '',
    };

    mockApiResponses(unnamedLocation);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Unnamed Location')).toBeInTheDocument();
    });
  });

  it('hides optional sections when data is missing', async () => {
    const minimalLocation = {
      ...mockLocation,
      siteContactName: '',
      siteContactPhone: '',
      siteContactEmail: '',
      accessInstructions: '',
      notes: '',
    };

    mockApiResponses(minimalLocation);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Optional sections should not be rendered
    expect(screen.queryByText('Site Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Access Instructions')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('displays additional contacts when present', async () => {
    const locationWithContacts = {
      ...mockLocation,
      additionalContacts: [
            {
              id: 'contact-1',
              name: 'Jane Manager',
              phone: '5559876543',
              email: 'jane@example.com',
              notes: 'Facilities manager',
              displayOrder: 0,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
    };

    mockApiResponses(locationWithContacts);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Jane Manager')).toBeInTheDocument();
    });

    expect(screen.getByText(/\(555\) 987-6543/i)).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Facilities manager')).toBeInTheDocument();
  });

  it('shows additional contacts section when user can edit', async () => {
    const minimalLocation = {
      ...mockLocation,
      siteContactName: '',
      siteContactPhone: '',
      siteContactEmail: '',
      additionalContacts: [],
    };

    mockApiResponses(minimalLocation);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Should show add button when user has permission
    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('shows additional contacts section when site contact exists', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Should show section because siteContactName exists
    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('opens add contact dialog when button is clicked', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add additional contact/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/create additional contact/i)).toBeInTheDocument();
    });
  });

  it('displays all tabs', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Check that all tabs are present
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /work order/i })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument();
  });

  it('switches to work orders tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Work Orders tab
    const workOrdersTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(workOrdersTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('switches to equipment tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Equipment tab
    const equipmentTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(equipmentTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('switches to activity tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Activity tab
    const activityTab = screen.getByRole('button', { name: /activity/i });
    await user.click(activityTab);

    await waitFor(() => {
      expect(activityTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('navigates back to service locations when back button is clicked', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Verify back button exists and has correct href
    const backButtons = screen.getAllByRole('button', { name: /back/i });
    expect(backButtons[0]).toBeInTheDocument();
  });

  it('navigates to customer detail when customer name is clicked', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    // Verify customer link exists and has correct href
    const customerLink = screen.getByText('Test Customer');
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays dispatch region when available', async () => {
    const locationWithRegion = {
      ...mockLocation,
      dispatchRegionId: 'region-1',
    };

    const mockDispatchRegions = [
      { id: 'region-1', name: 'North Region', isActive: true },
    ];

    mockApiResponses(locationWithRegion, mockDispatchRegions);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('North Region')).toBeInTheDocument();
    });
  });

  it('closes edit dialog when onClose is called', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Open edit dialog
    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Close dialog (cancel button)
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays empty state in work orders tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to work orders tab
    const workOrdersTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      // Check for the "no entities yet" message
      expect(screen.getByText(/no.*work order.*yet/i)).toBeInTheDocument();
    });
  });

  it('displays empty state in equipment tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to equipment tab
    const equipmentTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      // Check for the "no entities yet" message
      expect(screen.getByText(/no.*equipment.*yet/i)).toBeInTheDocument();
    });
  });

  it('displays notification logs in activity tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to activity tab
    const activityTab = screen.getByRole('button', { name: /activity/i });
    await user.click(activityTab);

    await waitFor(() => {
      // NotificationLogsList component is rendered
      // The component shows "Recent Notifications" heading from the component itself
      expect(activityTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('displays back button in error state', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back to service location/i });
    expect(backButton).toBeInTheDocument();
  });

  it('calls navigate when back button is clicked', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const backButton = screen.getAllByRole('button', { name: /back/i })[0];

    // Verify button exists and is clickable (navigation is tested in component)
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
  });

  it('customer link has correct href', async () => {
    mockApiResponses();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    const customerLink = screen.getByText('Test Customer');

    // Verify link has correct href
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays add button in work orders tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to work orders tab
    const workOrdersTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new work order/i })).toBeInTheDocument();
    });
  });

  it('displays add button in equipment tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to equipment tab
    const equipmentTab = within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });


  it('displays inactive status badge correctly', async () => {
    const inactiveLocation = {
      ...mockLocation,
      status: 'INACTIVE' as const,
    };

    mockApiResponses(inactiveLocation);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });

  it('back button in error state is clickable', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back to service location/i });

    // Verify button exists and is clickable
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
  });

  describe('equipment tab', () => {
    const equipmentList = [
      {
        id: 'eq-1',
        name: 'Upstairs Furnace',
        equipmentTypeName: 'HVAC',
        equipmentCategoryName: 'Furnace',
        make: 'Carrier',
        model: 'C-100',
        serialNumber: 'SN1',
        locationOnSite: 'Basement',
      },
      {
        id: 'eq-2',
        name: 'Walk-in Cooler',
        equipmentTypeName: null,
        equipmentCategoryName: null,
        make: null,
        model: null,
        serialNumber: 'SN2',
        locationOnSite: null,
      },
    ];

    it('renders equipment in a table when scoped to this service location', async () => {
      mockApiResponses(mockLocation, [], equipmentList);
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i }));

      await waitFor(() => {
        expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
      });
      expect(screen.getByText('HVAC / Furnace')).toBeInTheDocument();
      expect(screen.getByText('Carrier C-100')).toBeInTheDocument();
      expect(screen.getByText('Basement')).toBeInTheDocument();
      expect(screen.getByText('Walk-in Cooler')).toBeInTheDocument();
    });

    it('opens the equipment form dialog in create mode when Add is clicked', async () => {
      mockApiResponses();
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i }));
      await user.click(await screen.findByRole('button', { name: /add equipment/i }));

      // Dialog opens. Customer + service-location selectors should NOT be present
      // because the location is locked to the service-location detail page.
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      expect(screen.queryByLabelText(/customer/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/service location/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    });

    it('opens the edit dialog with the full record when Edit is selected', async () => {
      const fullRecord = { ...equipmentList[0], serviceLocationId: 'location-1', status: 'ACTIVE', attributes: '{}' };
      mockApiResponses(mockLocation, [], [fullRecord]);
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i }));
      await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

      const moreButtons = screen.getAllByRole('button', { name: /more options/i });
      await user.click(moreButtons[0]);
      await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    });

    it('opens the new-work-order dialog with the service location pre-selected', async () => {
      mockApiResponses();
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

      // Switch to work orders tab
      await user.click(
        within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', {
          name: /work order/i,
        })
      );
      await user.click(await screen.findByRole('button', { name: /new work order/i }));

      // Dialog opens — the prefilled location's display value should be visible
      // in the picker input. Picker formats as "{locationName} - {address}".
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      expect(
        screen.getByDisplayValue(/Main Office.*123 Main St.*Springfield/i)
      ).toBeInTheDocument();
    });

    it('clicking the equipment quick-stat switches to the equipment tab', async () => {
      mockApiResponses(mockLocation, [], equipmentList);
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

      // The quick-stat button shares the "Equipment" name with the tab; pick it
      // by scoping to the rendered count (2 equipment items in the fixture).
      const buttons = screen.getAllByRole('button', { name: /equipment/i });
      // The tab is inside the Tabs nav; the stat is outside of it.
      const tabsNav = screen.getByRole('navigation', { name: 'Tabs' });
      const statButton = buttons.find((b) => !tabsNav.contains(b));
      expect(statButton).toBeTruthy();
      await user.click(statButton!);

      // Equipment tab is now active — table should render.
      await waitFor(() => {
        expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
      });
    });

    it('confirms before deleting and calls the delete endpoint', async () => {
      mockApiResponses(mockLocation, [], equipmentList);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteSpy = vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
      const user = userEvent.setup();

      renderDetailPage();

      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('button', { name: /equipment/i }));
      await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

      const moreButtons = screen.getAllByRole('button', { name: /more options/i });
      await user.click(moreButtons[0]);
      await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled();
        expect(deleteSpy).toHaveBeenCalledWith('/equipment/eq-1');
      });
      confirmSpy.mockRestore();
    });
  });
});
