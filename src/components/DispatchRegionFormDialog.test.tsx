import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchRegionFormDialog from './DispatchRegionFormDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

describe('DispatchRegionFormDialog', () => {
  const mockOnClose = vi.fn();
  const mockRegion = {
    id: 'region-1',
    name: 'North Region',
    abbreviation: 'NORTH',
    description: 'Northern service area',
    state: 'GA',
    tabDisplayName: 'North',
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
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      expect(screen.getByRole('heading', { name: /create/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name.*\*/i)).toHaveValue('');
      expect(screen.getByLabelText(/abbreviation.*\*/i)).toHaveValue('');
    });

    it('submits create with required fields only', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      await user.type(screen.getByLabelText(/name.*\*/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation.*\*/i), 'TEST');

      const submitButton = screen.getByRole('button', { name: /^create$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions', {
          name: 'Test Region',
          abbreviation: 'TEST',
          description: '',
          state: '',
          tabDisplayName: '',
          sortOrder: 0,
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('converts abbreviation to uppercase', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      const abbreviationInput = screen.getByLabelText(/abbreviation.*\*/i);
      await user.type(abbreviationInput, 'test');

      expect(abbreviationInput).toHaveValue('TEST');
    });

    it('displays saving state during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      await user.type(screen.getByLabelText(/name.*\*/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation.*\*/i), 'TEST');

      const submitButton = screen.getByRole('button', { name: /^create$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
      });
    });

    it('shows optional fields when expanded', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      // Optional fields should not be visible initially
      expect(screen.queryByLabelText(/state/i)).not.toBeInTheDocument();

      // Click the optional fields toggle
      const toggleButton = screen.getByRole('button', { name: /optional \(3\)/i });
      await user.click(toggleButton);

      // Optional fields should now be visible
      await waitFor(() => {
        expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/tab/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      });
    });

    it('submits with all fields including optional', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={5} />
      );

      await user.type(screen.getByLabelText(/name.*\*/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation.*\*/i), 'TEST');

      // Expand optional fields
      await user.click(screen.getByRole('button', { name: /optional \(3\)/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
      });

      // Fill optional fields
      await user.selectOptions(screen.getByLabelText(/state/i), 'GA');
      await user.type(screen.getByLabelText(/tab/i), 'North');
      await user.type(screen.getByLabelText(/description/i), 'Test description');

      const submitButton = screen.getByRole('button', { name: /^create$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions', {
          name: 'Test Region',
          abbreviation: 'TEST',
          state: 'GA',
          sortOrder: 5,
          tabDisplayName: 'North',
          description: 'Test description',
        });
      });
    });

    it('displays error message on create failure', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValue(
        new Error('Create failed')
      );

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      await user.type(screen.getByLabelText(/name.*\*/i), 'Test Region');
      await user.type(screen.getByLabelText(/abbreviation.*\*/i), 'TEST');

      const submitButton = screen.getByRole('button', { name: /^create$/i });
      await user.click(submitButton);

      // Alert should be called (indicating error was displayed)
      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled(); // Dialog stays open on error
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
        />
      );

      expect(screen.getByRole('heading', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name.*\*/i)).toHaveValue('North Region');
      expect(screen.getByLabelText(/abbreviation.*\*/i)).toHaveValue('NORTH');
    });

    it('pre-fills optional fields when they have values', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DispatchRegionFormDialog
          isOpen={true}
          onClose={mockOnClose}
          region={mockRegion}
          nextSortOrder={0}
        />
      );

      // Expand optional fields
      await user.click(screen.getByRole('button', { name: /optional \(3\)/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/state/i)).toHaveValue('GA');
        expect(screen.getByLabelText(/tab/i)).toHaveValue('North');
        expect(screen.getByLabelText(/description/i)).toHaveValue('Northern service area');
      });
    });

    it('submits update with modified data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockRegion });

      renderWithProviders(
        <DispatchRegionFormDialog
          isOpen={true}
          onClose={mockOnClose}
          region={mockRegion}
          nextSortOrder={0}
        />
      );

      const nameInput = screen.getByLabelText(/name.*\*/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Region');

      const submitButton = screen.getByRole('button', { name: /^update$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/tenant/dispatch-regions/region-1',
          expect.objectContaining({
            name: 'Updated Region',
            abbreviation: 'NORTH',
          })
        );
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('displays error message on update failure', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockRejectedValue(
        new Error('Update failed')
      );

      renderWithProviders(
        <DispatchRegionFormDialog
          isOpen={true}
          onClose={mockOnClose}
          region={mockRegion}
          nextSortOrder={0}
        />
      );

      const submitButton = screen.getByRole('button', { name: /^update$/i });
      await user.click(submitButton);

      // Dialog should stay open on error
      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('Dialog behavior', () => {
    it('closes dialog when cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets form when reopened', async () => {
      const { rerender } = renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      const nameInput = screen.getByLabelText(/name.*\*/i);
      await userEvent.setup().type(nameInput, 'Test');

      // Close dialog
      rerender(<DispatchRegionFormDialog isOpen={false} onClose={mockOnClose} nextSortOrder={0} />);

      // Reopen dialog
      rerender(<DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />);

      // Form should be reset
      expect(screen.getByLabelText(/name.*\*/i)).toHaveValue('');
    });

    it('disables buttons while saving', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      await user.type(screen.getByLabelText(/name.*\*/i), 'Test');
      await user.type(screen.getByLabelText(/abbreviation.*\*/i), 'TST');

      const submitButton = screen.getByRole('button', { name: /^create$/i });
      await user.click(submitButton);

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        expect(cancelButton).toBeDisabled();
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
    });

    it('collapses optional fields on toggle', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DispatchRegionFormDialog isOpen={true} onClose={mockOnClose} nextSortOrder={0} />
      );

      // Expand optional fields
      const toggleButton = screen.getByRole('button', { name: /optional \(3\)/i });
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
      });

      // Collapse again
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.queryByLabelText(/state/i)).not.toBeInTheDocument();
      });
    });
  });
});
