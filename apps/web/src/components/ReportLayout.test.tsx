/* eslint-disable i18next/no-literal-string */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import ReportLayout from './ReportLayout';

describe('ReportLayout', () => {
  it('renders the title, description, and back link', () => {
    renderWithProviders(
      <ReportLayout title="Filter Pull List" description="for the truck">
        <div>body</div>
      </ReportLayout>,
    );
    expect(screen.getByText('Filter Pull List')).toBeInTheDocument();
    expect(screen.getByText('for the truck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();
  });

  it('renders the children', () => {
    renderWithProviders(
      <ReportLayout title="X">
        <div data-testid="report-body">body</div>
      </ReportLayout>,
    );
    expect(screen.getByTestId('report-body')).toBeInTheDocument();
  });

  it('omits the description block when none is provided', () => {
    renderWithProviders(
      <ReportLayout title="X">
        <div />
      </ReportLayout>,
    );
    // No description text → only the title heading is visible
    expect(screen.queryByText('description')).toBeNull();
  });

  it('renders the Print action when filters or actions are present', () => {
    renderWithProviders(
      <ReportLayout title="X" filters={<span>filter</span>}>
        <div />
      </ReportLayout>,
    );
    expect(screen.getByRole('button', { name: /^print$/i })).toBeInTheDocument();
  });

  it('triggers window.print() when Print is clicked', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(
      <ReportLayout title="X" actions={<span>extra</span>}>
        <div />
      </ReportLayout>,
    );
    await user.click(screen.getByRole('button', { name: /^print$/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('navigates back to /reports when the back link is clicked', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(
      <ReportLayout title="X">
        <div />
      </ReportLayout>,
    );
    await user.click(screen.getByRole('button', { name: /back to reports/i }));
    expect(router.state.location.pathname).toBe('/reports');
  });
});
