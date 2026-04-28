import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import NoteComposer from './NoteComposer';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('NoteComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the textarea and a disabled Save button when empty', () => {
    renderWithProviders(<NoteComposer workOrderId="wo-1" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save once the textarea has non-whitespace content', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NoteComposer workOrderId="wo-1" />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello');
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('POSTs to /work-orders/:id/notes and clears the textarea on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        id: 'n-1',
        workOrderId: 'wo-1',
        body: 'Customer called',
        createdByUserId: 'u-1',
        createdByUserName: 'Jamie',
        createdAt: '2026-04-27T14:00:00Z',
        updatedAt: '2026-04-27T14:00:00Z',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<NoteComposer workOrderId="wo-1" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'Customer called');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/wo-1/notes',
        { body: 'Customer called' }
      );
    });
    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('does not submit when the body is only whitespace', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NoteComposer workOrderId="wo-1" />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   ');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('focuses the textarea when N is pressed and no input is focused', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NoteComposer workOrderId="wo-1" />);
    const textarea = screen.getByRole('textbox');

    // Ensure nothing is focused initially
    (document.activeElement as HTMLElement | null)?.blur?.();
    await user.keyboard('n');

    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
  });
});
