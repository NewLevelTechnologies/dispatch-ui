import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import EquipmentNotesSection from './EquipmentNotesSection';
import apiClient from '../api/client';
import type { EquipmentNote } from '../api';

vi.mock('../api/client');

const makeNote = (overrides: Partial<EquipmentNote> = {}): EquipmentNote => ({
  id: 'note-1',
  body: 'A note body',
  authorUserId: 'user-1',
  authorName: 'Jane Smith',
  createdAt: '2026-05-05T12:00:00Z',
  updatedAt: '2026-05-05T12:00:00Z',
  ...overrides,
});

describe('EquipmentNotesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading + helper text + Add note CTA when empty', () => {
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[]}
        noteCount={0}
      />
    );
    expect(screen.getByText('Notes (0)')).toBeInTheDocument();
    expect(
      screen.getByText(/saved with this equipment, not this work order/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add note/i })
    ).toBeInTheDocument();
  });

  it('renders the recent notes preview with author + relative time', () => {
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[
          makeNote({ id: 'a', body: 'Replaced compressor', authorName: 'Jane' }),
          makeNote({ id: 'b', body: 'Filter due in May', authorName: 'Bob' }),
        ]}
        noteCount={2}
      />
    );
    expect(screen.getByText('Notes (2)')).toBeInTheDocument();
    expect(screen.getByText('Replaced compressor')).toBeInTheDocument();
    expect(screen.getByText('Filter due in May')).toBeInTheDocument();
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it('shows a "+N more" hint when noteCount exceeds recentNotes', () => {
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[
          makeNote({ id: 'a' }),
          makeNote({ id: 'b' }),
          makeNote({ id: 'c' }),
        ]}
        noteCount={7}
      />
    );
    expect(screen.getByText(/4 more on the equipment page/i)).toBeInTheDocument();
  });

  it('opens the composer when Add note is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[]}
        noteCount={0}
      />
    );
    await user.click(screen.getByRole('button', { name: /add note/i }));
    expect(
      screen.getByLabelText(/note body/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('disables Save when the draft is empty or whitespace-only', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[]}
        noteCount={0}
      />
    );
    await user.click(screen.getByRole('button', { name: /add note/i }));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    const textarea = screen.getByLabelText(/note body/i);
    await user.type(textarea, '   ');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    await user.clear(textarea);
    await user.type(textarea, 'Real content');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('POSTs the note body when Save is clicked', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: makeNote({ body: 'New note' }) });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[]}
        noteCount={0}
      />
    );
    await user.click(screen.getByRole('button', { name: /add note/i }));
    await user.type(screen.getByLabelText(/note body/i), 'New note');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/equipment/eq-1/notes',
        { body: 'New note' }
      );
    });
  });

  it('cancels the composer and clears the draft on Cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[]}
        noteCount={0}
      />
    );
    await user.click(screen.getByRole('button', { name: /add note/i }));
    await user.type(screen.getByLabelText(/note body/i), 'Throwaway');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/note body/i)).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    // Reopening should start with an empty draft, not the throwaway.
    await user.click(screen.getByRole('button', { name: /add note/i }));
    expect(screen.getByLabelText(/note body/i)).toHaveValue('');
  });

  it('hides the Add note CTA in readOnly mode but still renders existing notes', () => {
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[makeNote({ body: 'Existing knowledge' })]}
        noteCount={1}
        readOnly
      />
    );
    expect(screen.getByText('Existing knowledge')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add note/i })
    ).not.toBeInTheDocument();
  });

  it('falls back to "System" when authorName is null', () => {
    renderWithProviders(
      <EquipmentNotesSection
        equipmentId="eq-1"
        recentNotes={[
          makeNote({ id: 'a', body: 'Migrated note', authorName: null, authorUserId: null }),
        ]}
        noteCount={1}
      />
    );
    expect(screen.getByText(/System/)).toBeInTheDocument();
  });
});
