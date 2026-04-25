import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CloneRoleDialog from './CloneRoleDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockRole = {
  id: '1',
  name: 'Admin',
  description: 'Full system access',
  capabilities: ['*:*'],
  isProtected: true,
  isSystemRole: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('CloneRoleDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('renders dialog when open', () => {
    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Clone Role' })).toBeInTheDocument();
  });

  it('does not render dialog when closed', () => {
    renderWithProviders(
      <CloneRoleDialog isOpen={false} onClose={mockOnClose} role={mockRole} />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays role name in description', () => {
    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    expect(screen.getByText(/create a copy of "admin"/i)).toBeInTheDocument();
  });

  it('prefills name with "(Copy)" suffix', () => {
    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Admin (Copy)');
  });

  it('prefills description from original role', () => {
    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const descriptionInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descriptionInput.value).toBe('Full system access');
  });

  it('handles role without description', () => {
    const roleWithoutDescription = { ...mockRole, description: undefined };

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={roleWithoutDescription} />
    );

    const descriptionInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descriptionInput.value).toBe('');
  });

  it('allows editing name', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Almost Admin');

    expect(nameInput).toHaveValue('Almost Admin');
  });

  it('allows editing description', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const descriptionInput = screen.getByLabelText(/description/i);
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Almost full access');

    expect(descriptionInput).toHaveValue('Almost full access');
  });

  it('closes dialog when cancel is clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('submits clone request with correct data', async () => {
    const user = userEvent.setup();
    const clonedRole = { ...mockRole, id: '2', name: 'Admin (Copy)' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: clonedRole });

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/roles/1/clone', {
        name: 'Admin (Copy)',
        description: 'Full system access',
      });
    });
  });

  it('submits without description if empty', async () => {
    const user = userEvent.setup();
    const clonedRole = { ...mockRole, id: '2', name: 'Admin (Copy)' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: clonedRole });

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const descriptionInput = screen.getByLabelText(/description/i);
    await user.clear(descriptionInput);

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/roles/1/clone', {
        name: 'Admin (Copy)',
        description: undefined,
      });
    });
  });

  it('closes dialog on successful clone', async () => {
    const user = userEvent.setup();
    const clonedRole = { ...mockRole, id: '2', name: 'Admin (Copy)' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: clonedRole });

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('navigates to cloned role on success', async () => {
    const user = userEvent.setup();
    const clonedRole = { ...mockRole, id: '2', name: 'Admin (Copy)' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: clonedRole });

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/roles/2');
    });
  });

  it('displays cloning state during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Cloning...')).toBeInTheDocument();
    });

    expect(submitButton).toBeDisabled();
  });

  it('displays error message when clone fails', async () => {
    const user = userEvent.setup();
    const error = new Error('Name already exists');
    // @ts-expect-error - Adding response property to Error for test
    error.response = { data: { message: 'Name already exists' } };
    vi.mocked(apiClient.post).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Name already exists');
    });

    alertSpy.mockRestore();
  });

  it('displays generic error message when error has no message', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to clone role');
    });

    alertSpy.mockRestore();
  });

  it('resets form when dialog is reopened', async () => {
    const { rerender } = renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Admin (Copy)');

    // Close dialog
    rerender(
      <CloneRoleDialog isOpen={false} onClose={mockOnClose} role={mockRole} />
    );

    // Reopen with different role
    const differentRole = { ...mockRole, id: '2', name: 'Dispatcher' };
    rerender(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={differentRole} />
    );

    const updatedNameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(updatedNameInput.value).toBe('Dispatcher (Copy)');
  });

  it('requires name field', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={mockRole} />
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);

    const submitButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(submitButton);

    // Form should not submit without name
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('renders nothing when role is null', () => {
    const { container } = renderWithProviders(
      <CloneRoleDialog isOpen={true} onClose={mockOnClose} role={null} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
