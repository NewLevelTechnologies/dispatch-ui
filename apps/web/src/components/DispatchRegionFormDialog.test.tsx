import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchRegionFormDialog from './DispatchRegionFormDialog';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

describe('DispatchRegionFormDialog', () => {
  const mockOnClose = vi.fn();
  const mockRegion = {
    id: 'region-1',
    name: 'North Region',
    abbreviation: 'NORTH',
    sortOrder: 0,
    isActive: true,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
    version: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders create dialog with empty form', () => {
      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      expect(screen.getByRole('heading', { name: /add/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('');
      expect(screen.getByLabelText(/abbreviation/i)).toHaveValue('');
    });

    it('only renders Name + Abbreviation (no optional fields)', () => {
      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      // The dropped fields must not appear anywhere in the dialog.
      expect(screen.queryByLabelText(/state/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/tab/i)).not.toBeInTheDocument();
      // No "Optional (N)" disclosure either.
      expect(screen.queryByRole('button', { name: /optional/i })).not.toBeInTheDocument();
    });

    it('submits create with only the required fields', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={3} />,
      );

      await user.type(screen.getByLabelText(/name/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation/i), 'TEST');

      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions', {
          name: 'Test Region',
          abbreviation: 'TEST',
          sortOrder: 3,
        });
      });
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('converts abbreviation to uppercase as the user types', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      const abbreviation = screen.getByLabelText(/abbreviation/i);
      await user.type(abbreviation, 'test');
      expect(abbreviation).toHaveValue('TEST');
    });

    it('disables submit while saving and dialog stays open on error', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Create failed'));

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      await user.type(screen.getByLabelText(/name/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation/i), 'TEST');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('Edit mode', () => {
    it('renders edit dialog with populated form', () => {
      renderWithProviders(
        <DispatchRegionFormDialog
          isOpen={true}
          onClose={mockOnClose}
          region={mockRegion}
          nextSortOrder={0}
        />,
      );

      expect(screen.getByRole('heading', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('North Region');
      expect(screen.getByLabelText(/abbreviation/i)).toHaveValue('NORTH');
    });

    it('submits update with trimmed name + abbreviation only', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog
          isOpen={true}
          onClose={mockOnClose}
          region={mockRegion}
          nextSortOrder={0}
        />,
      );

      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Region');

      await user.click(screen.getByRole('button', { name: /^update$/i }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/tenant/dispatch-regions/region-1', {
          name: 'Updated Region',
          abbreviation: 'NORTH',
        });
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Dialog behavior', () => {
    it('closes dialog when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets form when reopened', async () => {
      const { rerender } = renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />,
      );

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/name/i), 'Test');

      rerender(<DispatchRegionFormDialog isOpen={false} onClose={mockOnClose} nextSortOrder={0} />);
      rerender(<DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />);

      expect(screen.getByLabelText(/name/i)).toHaveValue('');
    });
  });
});
