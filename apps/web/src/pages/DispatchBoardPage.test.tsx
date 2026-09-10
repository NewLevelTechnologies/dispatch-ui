import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchBoardPage from './DispatchBoardPage';

const mockGetBoard = vi.fn();
const mockGetUnscheduled = vi.fn();
const mockRegionsGetAll = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    dispatchBoardApi: {
      ...actual.dispatchBoardApi,
      getBoard: (...a: unknown[]) => mockGetBoard(...a),
      getUnscheduled: (...a: unknown[]) => mockGetUnscheduled(...a),
    },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: (...a: unknown[]) => mockRegionsGetAll(...a),
    },
  };
});

vi.mock('@dispatch/api/src/client');

const tech = (id: string, name: string, regionIds: string[]) => ({
  id,
  name,
  performsFieldWork: true,
  regionIds,
  primaryRegionId: regionIds[0] ?? null,
});

const emptyRail = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
};

describe('DispatchBoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBoard.mockResolvedValue({ techs: [], dispatches: [] });
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockRegionsGetAll.mockResolvedValue([]);
  });

  // The sidebar item and the page heading share one i18n key, so they render
  // the same string and cannot drift apart. Assert both by role rather than by
  // text — a bare text query matches both, which is the point.
  it('titles the page from the glossary and matches the nav label', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(
      await screen.findByRole('heading', { name: 'Dispatch Board', level: 1 })
    ).toBeInTheDocument();

    const navLink = screen.getByRole('link', { name: 'Dispatch Board' });
    expect(navLink).toHaveAttribute('href', '/dispatch');
  });

  // The structural empty state: no rows at all, which is different from
  // "nothing is scheduled today". It names the rule rather than diagnosing,
  // because the client can't tell a tenant with no field staff from a cache
  // that hasn't synced.
  it('shows the no-technicians state when the board has no rows', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText('No technicians on this board')).toBeInTheDocument();
    expect(
      screen.getByText(/A user appears here when one of their roles is marked/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review roles' })).toBeInTheDocument();
  });

  it('shows the genuinely-empty state when techs exist but nothing is scheduled', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.queryByText('No technicians on this board')).not.toBeInTheDocument();
  });

  it('distinguishes filtered-empty from genuinely-empty', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?region=r1' });

    expect(await screen.findByText('No dispatches match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('surfaces a failed board read without blanking the rail', async () => {
    mockGetBoard.mockRejectedValue(new Error('boom'));

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText("Couldn't load the board")).toBeInTheDocument();
    // The rail is a separate read and must still render its own state.
    expect(screen.getByText('Unscheduled')).toBeInTheDocument();
    expect(screen.getByText('Nothing unscheduled')).toBeInTheDocument();
  });

  // Self-hide (§3.1): the control keys off regions actually COVERED by the
  // board's techs, not the tenant's region registry — so a one-region shop
  // never sees it.
  it('hides the region filter when only one region is covered', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Nothing scheduled');
    expect(screen.queryByRole('button', { name: 'Region' })).not.toBeInTheDocument();
  });

  it('shows the region filter once a second region is covered', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1']), tech('u2', 'Kenji Tran', ['r2'])],
      dispatches: [],
    });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Nothing scheduled');
    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
  });

  // Coverage, not primary: a tech whose PRIMARY is Phoenix but who also
  // covers Tucson makes this a two-region board for filtering purposes.
  it('counts covered regions, not just primaries', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1', 'r2'])],
      dispatches: [],
    });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Nothing scheduled');
    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
  });

  it('scopes the board read to the region in the URL', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?region=r2' });

    await screen.findByText('No dispatches match these filters');
    expect(mockGetBoard).toHaveBeenCalledWith(
      expect.objectContaining({ regionIds: ['r2'] })
    );
  });

  it('reads the date from the URL and steps it a day at a time', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-15' });

    await screen.findByText('No technicians on this board');
    expect(mockGetBoard).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-03-15' }));

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-03-16' })
    );

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-03-14' })
    );
  });

  // Month/DST boundaries: local-midnight arithmetic drifts here, UTC parts
  // math does not.
  it('steps across a month boundary without drifting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-01' });

    await screen.findByText('No technicians on this board');
    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-02-28' })
    );
  });

  it('ignores a malformed date param rather than querying garbage', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=not-a-date' });

    await screen.findByText('No technicians on this board');
    expect(mockGetBoard).toHaveBeenCalledWith(
      expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    );
  });
});
