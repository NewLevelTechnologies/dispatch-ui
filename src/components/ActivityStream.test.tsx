import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ActivityStream from './ActivityStream';
import apiClient from '../api/client';
import type { ActivityEvent, ActivityPage } from '../api';

vi.mock('../api/client');

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'evt-1',
  kind: 'NOTE_ADDED',
  category: 'NOTE',
  timestamp: '2026-04-27T14:00:00Z',
  actor: { userId: 'u-1', userName: 'Jamie Smith' },
  data: {},
  ...overrides,
});

const page = (events: ActivityEvent[], hasMore = false, nextCursor: string | null = null): ActivityPage => ({
  content: events,
  nextCursor,
  hasMore,
});

describe('ActivityStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub IntersectionObserver — used by the load-more sentinel
    global.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
  });

  it('renders the empty state when there are no events', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: page([]) });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });

  it('renders one row per event with the actor byline', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({
          id: 'e1',
          kind: 'WORK_ITEM_STATUS_CHANGED',
          category: 'STATUS',
          data: {
            workItemId: 'wi-1',
            workItemDescription: 'Replace filter',
            fromStatusName: 'Pending',
            toStatusName: 'In Progress',
          },
        }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Replace filter — status changed from Pending to In Progress/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/by Jamie Smith/)).toBeInTheDocument();
  });

  it('renders the note body for NOTE_ADDED events', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({
          id: 'e1',
          kind: 'NOTE_ADDED',
          category: 'NOTE',
          data: { noteId: 'n-1', bodyExcerpt: 'Customer called back at 3pm' },
        }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText('Customer called back at 3pm')).toBeInTheDocument();
    });
  });

  it('renders "System" for events with no actor', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([event({ actor: null })]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText(/by System/)).toBeInTheDocument();
    });
  });

  it('passes the selected category as a server-side filter when a chip is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: page([]) });
    const user = userEvent.setup();
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Notes' }));

    await waitFor(() => {
      const calls = vi.mocked(apiClient.get).mock.calls;
      const lastCall = calls[calls.length - 1];
      const params = (lastCall?.[1] as { params?: Record<string, unknown> })?.params;
      expect(params).toMatchObject({ categories: 'NOTE' });
    });
  });

  it('does not pass categories when "All" is selected', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: page([]) });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });
    const firstCall = vi.mocked(apiClient.get).mock.calls[0];
    const params = (firstCall?.[1] as { params?: Record<string, unknown> })?.params;
    expect(params?.categories).toBeUndefined();
  });

  it('treats "Unknown" actor.userName as no actor and renders System', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({
          actor: { userId: 'u-1', userName: 'Unknown' },
        }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText(/by System/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/by Unknown/)).not.toBeInTheDocument();
  });

  it('treats empty/whitespace actor.userName as no actor', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({
          id: 'e-blank',
          actor: { userId: 'u-1', userName: '   ' },
        }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText(/by System/)).toBeInTheDocument();
    });
  });

  it('renders day-group headers between events on different days', async () => {
    const todayIso = new Date().toISOString();
    const yesterdayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({ id: 'e-today', timestamp: todayIso }),
        event({ id: 'e-yesterday', timestamp: yesterdayIso }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('resolves {{entity}} placeholders in templates via the glossary', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        event({
          id: 'e-cancelled',
          kind: 'WORK_ORDER_CANCELLED',
          category: 'STATUS',
          data: {},
        }),
        event({
          id: 'e-invoice',
          kind: 'INVOICE_ISSUED',
          category: 'FINANCIAL',
          data: { invoiceNumber: '11079', amount: 9800 },
        }),
      ]),
    });
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      // Default glossary: work_order singular = "Work Order", invoice = "Invoice"
      expect(screen.getByText('Work Order cancelled')).toBeInTheDocument();
    });
    expect(screen.getByText(/Invoice 11079 issued for \$9,800/)).toBeInTheDocument();
  });

  it('shows the filter-aware empty state when a non-All filter has no events', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: page([]) });
    const user = userEvent.setup();
    renderWithProviders(<ActivityStream workOrderId="wo-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await waitFor(() => {
      expect(screen.getByText(/no matching events for this filter/i)).toBeInTheDocument();
    });
  });
});
