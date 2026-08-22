import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrdersPage from './WorkOrdersPage';
import { apiClient } from '../api/setup';

// Mock the API client
vi.mock('@dispatch/api/src/client');

// Wrap a list in the Spring Page<T> shape the work-orders endpoint now returns.
function pageOf<T>(items: T[], totalElements: number = items.length): {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
} {
  return {
    content: items,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / 50)),
    number: 0,
    size: 50,
    first: true,
    last: totalElements <= 50,
  };
}

const mockWorkOrders = [
  {
    id: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
    workOrderNumber: 'WO-00001',
    customerId: 'cccccccc-dddd-eeee-ffff-222222222222',
    serviceLocationId: 'location-1',
    lifecycleState: 'ACTIVE' as const,
    progressCategory: 'NOT_STARTED' as const,
    priority: 'NORMAL' as const,
    scheduledDate: '2024-03-15T10:00:00Z',
    workItemCount: 0,
    workItems: [],
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
    customer: {
      id: 'cccccccc-dddd-eeee-ffff-222222222222',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '5551234567',
    },
    serviceLocation: {
      id: 'location-1',
      locationName: "John's House",
      address: {
        streetAddress: '123 Main St',
        city: 'Atlanta',
        state: 'GA',
        zipCode: '30301',
      },
      siteContactName: 'John Doe',
      siteContactPhone: '5551234567',
    },
  },
  {
    id: 'bbbbbbbb-cccc-dddd-eeee-333333333333',
    workOrderNumber: 'WO-00002',
    customerId: 'dddddddd-eeee-ffff-0000-444444444444',
    serviceLocationId: 'location-2',
    lifecycleState: 'ACTIVE' as const,
    progressCategory: 'IN_PROGRESS' as const,
    priority: 'NORMAL' as const,
    scheduledDate: '2024-03-14T10:00:00Z',
    workItemCount: 0,
    workItems: [],
    createdAt: '2024-03-02T11:00:00Z',
    updatedAt: '2024-03-02T11:00:00Z',
    customer: {
      id: 'dddddddd-eeee-ffff-0000-444444444444',
      name: 'Jane Smith',
      email: 'jane@example.com',
    },
    serviceLocation: {
      id: 'location-2',
      locationName: null,
      address: {
        streetAddress: '456 Oak Ave',
        city: 'Marietta',
        state: 'GA',
        zipCode: '30060',
      },
    },
  },
];

describe('WorkOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and create button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

    renderWithProviders(<WorkOrdersPage />);

    expect(screen.getByRole('heading', { name: 'Work Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create work order/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching work orders', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<WorkOrdersPage />);

    expect(await screen.findByText('Loading work orders...')).toBeInTheDocument();
  });

  it('displays work orders in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });

    expect(screen.getByText('WO-00002')).toBeInTheDocument();
    expect(screen.getByText('WO-00001')).toBeInTheDocument();
    expect(screen.getByText('WO-00002')).toBeInTheDocument();
  });

  it('displays progress badges with correct labels', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Not Started')).toBeInTheDocument();
    });

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading work orders/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no work orders exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No work orders found')).toBeInTheDocument();
    });
  });

  it('navigates to the full-page intake when create is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
    const user = userEvent.setup();

    const { router } = renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No work orders found')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create work order/i });
    await user.click(createButton);

    // Create is a full page now, not a dialog.
    expect(router.state.location.pathname).toBe('/work-orders/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('formats scheduled dates correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Mar 15, 2024')).toBeInTheDocument();
    });

    expect(screen.getByText('Mar 14, 2024')).toBeInTheDocument();
  });

  it('displays work order numbers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([mockWorkOrders[0]]) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });
  });

  it('falls back to truncated UUID when workOrderNumber is not available', async () => {
    const workOrderWithoutNumber = {
      ...mockWorkOrders[0],
      workOrderNumber: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([workOrderWithoutNumber]) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('#aaaaaaaa')).toBeInTheDocument();
    });
  });

  it('handles work orders without scheduled dates', async () => {
    const workOrderWithoutDate = {
      ...mockWorkOrders[0],
      scheduledDate: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([workOrderWithoutDate]) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });

    // Should display dash for missing date
    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('displays service location information', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    // Check for parts of the address (text is split across elements)
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
    expect(screen.getByText(/Atlanta/)).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
    expect(screen.getByText(/Marietta/)).toBeInTheDocument();
  });


  it('opens edit dialog when edit button is clicked', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open with Edit Work Order title
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Edit Work Order').length).toBeGreaterThan(0);
  });

  it('calls delete mutation when delete is confirmed', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this work order?');
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/aaaaaaaa-bbbb-cccc-dddd-111111111111');
    });

    confirmSpy.mockRestore();
  });

  it('does not delete when deletion is cancelled', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf(mockWorkOrders) });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
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

  describe('Filters', () => {
    it('renders the wider search input with the new descriptive placeholder', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
      renderWithProviders(<WorkOrdersPage />);

      expect(
        screen.getByPlaceholderText(/search by wo#, customer, or address/i)
      ).toBeInTheDocument();
    });

    it('debounces search input and forwards it to the work-orders endpoint', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
      const user = userEvent.setup();

      renderWithProviders(<WorkOrdersPage />);

      const searchInput = screen.getByPlaceholderText(/search by wo#, customer, or address/i);
      await user.type(searchInput, 'lenox');

      // Wait past the 300ms debounce for the new request to fire. The backend
      // takes the search term as `q` (see ListWorkOrdersParams), not `search`.
      await waitFor(() => {
        const workOrderCalls = vi.mocked(apiClient.get).mock.calls.filter(
          ([url]) => url === '/work-orders'
        );
        const lastCall = workOrderCalls[workOrderCalls.length - 1];
        expect(lastCall?.[1]?.params).toEqual(expect.objectContaining({ q: 'lenox' }));
      }, { timeout: 2000 });
    });

    it('reflects URL search param in the search input', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

      // The URL param matches the API param: `q`, not `search`.
      renderWithProviders(<WorkOrdersPage />, { initialPath: '/?q=lenox' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search by wo#, customer, or address/i)).toHaveValue('lenox');
      });
    });

    it('reads a from/to range from the URL into the scheduled-date params', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

      renderWithProviders(<WorkOrdersPage />, { initialPath: '/?from=2026-05-01&to=2026-05-31' });

      await waitFor(() => {
        const sent = vi
          .mocked(apiClient.get)
          .mock.calls.some(
            ([u, cfg]) =>
              String(u).startsWith('/work-orders') &&
              (cfg as { params?: { scheduledDateFrom?: string } } | undefined)?.params?.scheduledDateFrom ===
                '2026-05-01' &&
              (cfg as { params?: { scheduledDateTo?: string } } | undefined)?.params?.scheduledDateTo === '2026-05-31',
          );
        expect(sent).toBe(true);
      });
    });

    it('resolves a legacy date=preset URL to a concrete range', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

      renderWithProviders(<WorkOrdersPage />, { initialPath: '/?date=last30' });

      await waitFor(() => {
        const sent = vi
          .mocked(apiClient.get)
          .mock.calls.some(
            ([u, cfg]) =>
              String(u).startsWith('/work-orders') &&
              Boolean((cfg as { params?: { scheduledDateFrom?: string } } | undefined)?.params?.scheduledDateFrom),
          );
        expect(sent).toBe(true);
      });
    });

    it('maps a progress status to progressCategory + lifecycleState=ACTIVE', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

      renderWithProviders(<WorkOrdersPage />, { initialPath: '/?status=BLOCKED' });

      // ?status=BLOCKED → list query: progressCategory=['BLOCKED'] AND
      // lifecycleState=ACTIVE (ACTIVE keeps cancelled-mid-work WOs out).
      await waitFor(() => {
        const hit = vi.mocked(apiClient.get).mock.calls.some(([url, cfg]) => {
          if (String(url) !== '/work-orders') return false;
          const p = (cfg as { params?: { progressCategory?: unknown; lifecycleState?: unknown } } | undefined)?.params;
          return Array.isArray(p?.progressCategory) && p.progressCategory.length === 1
            && p.progressCategory[0] === 'BLOCKED' && p.lifecycleState === 'ACTIVE';
        });
        expect(hit).toBe(true);
      });
    });

    it('maps Cancelled to lifecycleState=CANCELLED with no progressCategory', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });

      renderWithProviders(<WorkOrdersPage />, { initialPath: '/?status=CANCELLED' });

      // Cancellation is a lifecycle axis, not a progress category — filtering on
      // progressCategory=CANCELLED would miss most cancelled WOs.
      await waitFor(() => {
        const hit = vi.mocked(apiClient.get).mock.calls.some(([url, cfg]) => {
          if (String(url) !== '/work-orders') return false;
          const p = (cfg as { params?: { progressCategory?: unknown; lifecycleState?: unknown } } | undefined)?.params;
          return p?.lifecycleState === 'CANCELLED' && p?.progressCategory === undefined;
        });
        expect(hit).toBe(true);
      });
    });

    it('typing in search updates the input value', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
      const user = userEvent.setup();
      renderWithProviders(<WorkOrdersPage />);

      const search = screen.getByPlaceholderText(
        /search by wo#, customer, or address/i,
      );
      await user.type(search, 'lenox');
      expect(search).toHaveValue('lenox');
    });

    it('selecting a date preset writes the resolved from/to range to the URL', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
      const user = userEvent.setup();
      const { router } = renderWithProviders(<WorkOrdersPage />);

      // Scheduled filter is the date-range popover chip.
      const scheduledFilter = await screen.findByRole('button', {
        name: /scheduled/i,
      });
      await user.click(scheduledFilter);

      // Presets resolve to concrete day strings at click time.
      const preset = await screen.findByRole('button', { name: /last 30 days/i });
      await user.click(preset);

      await waitFor(() => {
        expect(router.state.location.search).toContain('from=');
        expect(router.state.location.search).toContain('to=');
        expect(router.state.location.search).not.toContain('date=');
      });
    });
  });

  describe('Assigned users (embedded technicians[])', () => {
    const mockUsers = [
      { id: 'user-1', firstName: 'Brian', lastName: 'Ortega', email: 'brian@example.com', enabled: true },
      { id: 'user-2', firstName: 'Dana', lastName: 'Park', email: 'dana@example.com', enabled: true },
    ];

    // Route /users to a real user page; everything else gets the WO page.
    const mockGets = (workOrders: unknown[]) => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        const u = String(url);
        if (u.startsWith('/work-orders/facets')) {
          return Promise.resolve({ data: { onSite: 0, unassigned: 0, urgentHigh: 0 } });
        }
        if (u.startsWith('/users')) return Promise.resolve({ data: pageOf(mockUsers) });
        return Promise.resolve({ data: pageOf(workOrders) });
      });
    };

    it('renders the assigned column from embedded assignedUsers (lead + overflow, Unassigned when empty)', async () => {
      mockGets([
        {
          ...mockWorkOrders[0],
          assignedUsers: [
            { userId: 'user-2', name: 'Dana Park', state: 'ON_SITE' },
            { userId: 'user-1', name: 'Brian Ortega', state: 'SCHEDULED' },
          ],
        },
        { ...mockWorkOrders[1], assignedUsers: [] },
      ]);

      renderWithProviders(<WorkOrdersPage />);

      await waitFor(() => {
        expect(screen.getByText('Dana Park +1')).toBeInTheDocument();
      });
      // Empty assignedUsers renders the "Unassigned" cell (not a bare dash) —
      // ≥2 because the Unassigned quick-filter chip carries the label too.
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThanOrEqual(2);
    });

    it('selecting an assigned user updates the URL and the API query', async () => {
      mockGets(mockWorkOrders);
      const user = userEvent.setup();
      const { router } = renderWithProviders(<WorkOrdersPage />);

      // Match exactly "Assigned" so neither the "Unassigned" quick chip nor the
      // "Assigned to me" scope button collides with the Assigned dropdown.
      const assignedFilter = await screen.findByRole('button', { name: /^assigned$/i });
      await user.click(assignedFilter);

      const brian = await screen.findByRole('option', { name: /brian ortega/i });
      await user.click(brian);

      await waitFor(() => {
        expect(router.state.location.search).toContain('assigned=user-1');
      });
      await waitFor(() => {
        const woCalls = vi.mocked(apiClient.get).mock.calls.filter(([url]) =>
          String(url).startsWith('/work-orders')
        );
        const lastParams = woCalls[woCalls.length - 1]?.[1]?.params as
          | { assignedUserId?: string }
          | undefined;
        expect(lastParams?.assignedUserId).toBe('user-1');
      });
    });

    it('the Unassigned quick chip filters on unassigned=true (server-side)', async () => {
      mockGets(mockWorkOrders);
      const user = userEvent.setup();
      const { router } = renderWithProviders(<WorkOrdersPage />);

      const chip = await screen.findByRole('button', { name: /^unassigned/i });
      await user.click(chip);

      await waitFor(() => {
        expect(router.state.location.search).toContain('unassigned=true');
      });
      await waitFor(() => {
        const woCalls = vi.mocked(apiClient.get).mock.calls.filter(
          ([url]) => String(url).startsWith('/work-orders')
        );
        const listCall = woCalls.find(([, cfg]) => {
          const p = cfg?.params as { unassigned?: boolean; size?: number } | undefined;
          return p?.unassigned === true && p?.size !== 1;
        });
        expect(listCall).toBeTruthy();
      });
    });

    it('the Urgent / High quick chip filters on priority=[URGENT,HIGH]', async () => {
      mockGets(mockWorkOrders);
      const user = userEvent.setup();
      const { router } = renderWithProviders(<WorkOrdersPage />);

      const chip = await screen.findByRole('button', { name: /urgent \/ high/i });
      await user.click(chip);

      await waitFor(() => {
        expect(router.state.location.search).toContain('priority=URGENT');
        expect(router.state.location.search).toContain('priority=HIGH');
      });
    });

    it('the Show archived toggle sets archived=true (visibility, not a filter dropdown)', async () => {
      mockGets(mockWorkOrders);
      const user = userEvent.setup();
      const { router } = renderWithProviders(<WorkOrdersPage />);

      const toggle = await screen.findByRole('switch', { name: /show archived/i });
      await user.click(toggle);

      await waitFor(() => {
        expect(router.state.location.search).toContain('archived=true');
      });
    });

    it('presents WO status as a primary dropdown, not tabs', async () => {
      mockGets(mockWorkOrders);
      renderWithProviders(<WorkOrdersPage />);
      // Status is a dropdown chip (default "Open"); the lifecycle tabs are gone.
      // Exact match so the chip's "Status — clear" × button doesn't collide.
      expect(await screen.findByRole('button', { name: /^status$/i })).toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });
  });

  describe('Archive flow', () => {
    it('shows archive confirmation when archive action is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: pageOf(mockWorkOrders),
      });
      const confirmSpy = vi
        .spyOn(window, 'confirm')
        .mockReturnValue(false);
      const user = userEvent.setup();

      renderWithProviders(<WorkOrdersPage />);

      await waitFor(() => {
        expect(screen.getByText('WO-00001')).toBeInTheDocument();
      });

      const dropdownButtons = screen.getAllByRole('button', {
        name: /more options/i,
      });
      await user.click(dropdownButtons[0]);

      const archiveItem = await screen.findByRole('menuitem', {
        name: /^archive/i,
      });
      await user.click(archiveItem);

      expect(confirmSpy).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('opens cancel dialog when cancel action is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: pageOf(mockWorkOrders),
      });
      const user = userEvent.setup();

      renderWithProviders(<WorkOrdersPage />);

      await waitFor(() => {
        expect(screen.getByText('WO-00001')).toBeInTheDocument();
      });

      const dropdownButtons = screen.getAllByRole('button', {
        name: /more options/i,
      });
      await user.click(dropdownButtons[0]);

      const cancelItem = await screen.findByRole('menuitem', {
        name: /cancel/i,
      });
      await user.click(cancelItem);

      // CancelWorkOrderDialog opens with the WO context.
      await waitFor(() => {
        const dialogs = screen.queryAllByRole('dialog');
        expect(dialogs.length).toBeGreaterThan(0);
      });
    });
  });
});
