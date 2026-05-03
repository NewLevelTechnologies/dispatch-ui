import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';

const mockUpload = vi.fn();
const mockPatch = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentImagesApi: {
      upload: (...args: unknown[]) => mockUpload(...args),
      patch: (...args: unknown[]) => mockPatch(...args),
    },
  };
});

vi.mock('../api/client');

describe('EquipmentImageUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={false} onClose={vi.fn()} equipmentId="eq-1" />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks submit when no file is chosen', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    // Submit button is disabled until a file is chosen
    const submit = screen.getByRole('button', { name: /create/i });
    expect(submit).toBeDisabled();
  });

  it('rejects unsupported content types client-side (HEIC drag-in)', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    // Bypass userEvent's accept-attribute filter and our React state machine
    // by firing the change event directly — simulates a drag-and-drop or
    // programmatic upload that escapes the OS picker.
    const heic = new File(['x'], 'photo.heic', { type: 'image/heic' });
    fireEvent.change(input, { target: { files: [heic] } });

    await waitFor(() => {
      expect(
        screen.getByText(/only jpeg, png, and webp are supported/i)
      ).toBeInTheDocument();
    });
  });

  it('rejects oversized files client-side', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    // 26 MB JPEG via direct change-event injection; userEvent.upload has size
    // quirks in jsdom for large files.
    const big = new File(['x'.repeat(26 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => {
      expect(screen.getByText(/the maximum is 25 mb/i)).toBeInTheDocument();
    });
  });

  it('runs the 3-step upload helper with caption when valid', async () => {
    mockUpload.mockResolvedValue({ id: 'img-1' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(input, jpeg);

    await user.type(screen.getByLabelText(/^label$/i), 'Nameplate');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        'eq-1',
        jpeg,
        expect.objectContaining({ caption: 'Nameplate' })
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces server error message on upload failure', async () => {
    mockUpload.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Upload exceeded the limit.' } },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(input, jpeg);
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Upload exceeded the limit.')).toBeInTheDocument();
    });
  });

  it('checkbox is unchecked by default', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const checkbox = screen.getByRole('checkbox', { name: /set as profile/i });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('checkbox is checked by default when defaultSetProfile is true', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        defaultSetProfile
      />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const checkbox = screen.getByRole('checkbox', { name: /set as profile/i });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('promotes the new image to profile when checkbox is checked', async () => {
    mockUpload.mockResolvedValue({ id: 'img-new', isProfile: false });
    mockPatch.mockResolvedValue({ id: 'img-new', isProfile: true });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog
        isOpen={true}
        onClose={onClose}
        equipmentId="eq-1"
        defaultSetProfile
      />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(input, jpeg);
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('eq-1', 'img-new', { isProfile: true });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('skips the profile patch when the upload already returns isProfile=true', async () => {
    // Backend safety net (auto-promote first photo) shows up as the upload's
    // own response — UI should NOT issue a redundant PATCH in that case.
    mockUpload.mockResolvedValue({ id: 'img-new', isProfile: true });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        defaultSetProfile
      />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(input, jpeg);
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('cancel calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
