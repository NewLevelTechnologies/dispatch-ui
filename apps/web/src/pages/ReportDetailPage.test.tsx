import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import ReportDetailPage from './ReportDetailPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const renderAt = (slug: string) =>
  renderWithProviders(<ReportDetailPage />, {
    routes: [
      { path: '/reports/:slug', element: <ReportDetailPage /> },
      { path: '*', element: <ReportDetailPage /> },
    ],
    initialPath: `/reports/${slug}`,
  });

describe('ReportDetailPage', () => {
  it('renders the report component when the slug is registered', async () => {
    renderAt('filter-pull-list');
    // CI runners can take several seconds to render the report's
    // PageHead behind two cold-cache React Query taxonomy fetches.
    // Bump the default 1s waitFor so this test stops flaking under load.
    await waitFor(
      () => {
        expect(
          screen.getByRole('heading', { name: /filter pull list/i }),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  });

  it('renders the not-found surface when the slug is unknown', () => {
    renderAt('does-not-exist');
    expect(screen.getByText(/that report does not exist/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to reports/i }),
    ).toBeInTheDocument();
  });

  it('navigates back to /reports when the back button is clicked', async () => {
    navigateMock.mockClear();
    const user = userEvent.setup();
    renderAt('does-not-exist');
    await user.click(screen.getByRole('button', { name: /back to reports/i }));
    expect(navigateMock).toHaveBeenCalledWith('/reports');
  });
});
