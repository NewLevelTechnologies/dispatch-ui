import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import NoteDialog from './NoteDialog';
import type { NoteDto } from '../api/setup';

const note: NoteDto = {
  id: 'n-1',
  body: 'Roof access via rear ladder',
  pinned: true,
  authorName: 'Dispatch',
  createdAt: '2024-05-01T00:00:00Z',
  updatedAt: '2024-05-01T00:00:00Z',
};

describe('NoteDialog', () => {
  it('renders the add title with an empty body', () => {
    renderWithProviders(
      <NoteDialog isOpen onClose={vi.fn()} note={null} onSave={vi.fn()} saving={false} />
    );
    expect(screen.getByText(/add note/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders the edit title prefilled with body + pinned state', () => {
    renderWithProviders(
      <NoteDialog isOpen onClose={vi.fn()} note={note} onSave={vi.fn()} saving={false} />
    );
    expect(screen.getByText(/edit note/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Roof access via rear ladder');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('blocks save and shows an error when the body is blank', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <NoteDialog isOpen onClose={vi.fn()} note={null} onSave={onSave} saving={false} />
    );
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/can't be empty/i)).toBeInTheDocument();
  });

  it('trims the body and reports the pinned flag on save', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <NoteDialog isOpen onClose={vi.fn()} note={null} onSave={onSave} saving={false} />
    );
    await user.type(screen.getByRole('textbox'), '  Gate code 4821  ');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ body: 'Gate code 4821', pinned: true }));
  });
});
