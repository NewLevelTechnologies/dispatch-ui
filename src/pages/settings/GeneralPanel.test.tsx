import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import GeneralPanel from './GeneralPanel';
import apiClient from '../../api/client';

vi.mock('../../api/client');

const mockSettings = {
  tenantId: 't-1',
  companyName: 'Acme HVAC',
  companyNameShort: 'Acme',
  companySlogan: 'Comfort First',
  logoOriginalUrl: null,
  logoLargeUrl: null,
  logoMediumUrl: null,
  logoSmallUrl: null,
  logoThumbnailUrl: null,
  primaryColor: '#1976d2',
  secondaryColor: '#dc004e',
  streetAddress: '123 Main',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  phone: '5551234567',
  email: 'info@acme.com',
  timezone: 'America/Chicago',
  defaultTaxRate: 0.0825,
  invoiceTerms: 'Net 30',
  enableOnlineBooking: true,
  enableSmsNotifications: false,
  enableEmailNotifications: true,
  glossary: {},
  updatedAt: '2026-03-27T10:30:00Z',
};

describe('GeneralPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
  });

  it('renders settings in view mode', async () => {
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => {
      expect(screen.getByText('Acme HVAC')).toBeInTheDocument();
    });
    expect(screen.getByText('123 Main')).toBeInTheDocument();
    expect(screen.getByText('Springfield, IL 62701')).toBeInTheDocument();
    expect(screen.getByText('America/Chicago')).toBeInTheDocument();
    expect(screen.getByText('Net 30')).toBeInTheDocument();
  });

  it('shows feature flag enabled/disabled badges', async () => {
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => {
      expect(screen.getByText('Acme HVAC')).toBeInTheDocument();
    });

    // 2 enabled flags + 1 disabled flag
    expect(screen.getAllByText('Enabled').length).toBe(2);
    expect(screen.getAllByText('Disabled').length).toBe(1);
  });

  it('switches to edit mode on Edit click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.getByLabelText(/company name/i)).toHaveValue('Acme HVAC');
    expect(screen.getByLabelText(/street/i)).toHaveValue('123 Main');
  });

  it('cancel returns to view mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Edit button back means view mode
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('submits update with modified company name', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockSettings, companyName: 'New Name' } });
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));

    const nameInput = screen.getByLabelText(/company name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ companyName: 'New Name' })
      );
    });
  });

  it('shows loading state while fetching', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<GeneralPanel />);
    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => {
      expect(screen.getByText(/error loading tenant settings/i)).toBeInTheDocument();
    });
  });

  it('surfaces API error message on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Token expired' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<GeneralPanel />);

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  it('submits update with edits to multiple fields', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockSettings });
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Edit a handful of fields to exercise their onChange handlers
    const cityInput = screen.getByLabelText(/city/i);
    await user.clear(cityInput);
    await user.type(cityInput, 'Atlanta');

    const zipInput = screen.getByLabelText(/zip/i);
    await user.clear(zipInput);
    await user.type(zipInput, '30301');

    const slogan = screen.getByLabelText(/slogan/i);
    await user.clear(slogan);
    await user.type(slogan, 'Best HVAC');

    const invoiceTerms = screen.getByLabelText(/invoice terms/i);
    await user.clear(invoiceTerms);
    await user.type(invoiceTerms, 'Net 15');

    // Toggle a feature flag
    const onlineBookingCheckbox = screen.getByRole('checkbox', { name: /online booking/i });
    await user.click(onlineBookingCheckbox);

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({
          city: 'Atlanta',
          zipCode: '30301',
          companySlogan: 'Best HVAC',
          invoiceTerms: 'Net 15',
          enableOnlineBooking: false,
        })
      );
    });
  });

  it('rejects logo file larger than 5MB', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'logo.png', { type: 'image/png' });
    await user.upload(fileInput, bigFile);

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/file size/i));
    expect(apiClient.post).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('uploads a valid logo file', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { logoOriginalUrl: 'https://cdn.example.com/logo.png' },
    });

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // After file selection an Upload Logo button appears
    const uploadButton = await screen.findByRole('button', { name: /upload/i });
    await user.click(uploadButton);

    await waitFor(() => {
      // tenantSettingsApi.uploadLogo posts a multipart form to the logo endpoint
      expect(apiClient.post).toHaveBeenCalled();
    });
  });

  it('renders existing logo thumbnail in view mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockSettings, logoThumbnailUrl: 'https://cdn.example.com/logo.png' },
    });
    renderWithProviders(<GeneralPanel />);

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    const logoImg = screen.getAllByAltText(/company logo/i)[0];
    expect(logoImg).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('alerts when logo upload fails', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'File too large on server' } },
    });
    vi.mocked(apiClient.post).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const uploadButton = await screen.findByRole('button', { name: /upload/i });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('File too large on server');
    });
    alertSpy.mockRestore();
  });

  it('alerts when settings update fails', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Validation failed' } },
    });
    vi.mocked(apiClient.put).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Validation failed');
    });
    alertSpy.mockRestore();
  });

  it('exercises color pickers, timezone, tax rate, and feature flag toggles', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockSettings });

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Color pickers (type=color) — fireEvent since userEvent.type doesn't work on color inputs
    fireEvent.change(screen.getByLabelText(/primary color/i), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByLabelText(/secondary color/i), { target: { value: '#00ff00' } });

    // Timezone select
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'America/Los_Angeles');

    // Tax rate (also fireEvent — typing into number inputs with min/max can interleave validation)
    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '0.05' } });

    // Toggle remaining feature flags
    await user.click(screen.getByRole('checkbox', { name: /sms/i }));
    await user.click(screen.getByRole('checkbox', { name: /email/i }));

    await user.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({
          primaryColor: '#ff0000',
          secondaryColor: '#00ff00',
          timezone: 'America/Los_Angeles',
          enableSmsNotifications: true,
          enableEmailNotifications: false,
        })
      );
    });
  });

  it('rejects logo file with wrong type', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<GeneralPanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const wrongFile = new File(['x'], 'logo.gif', { type: 'image/gif' });
    // Use fireEvent so the file's .type is preserved as set (userEvent.upload may not).
    fireEvent.change(fileInput, { target: { files: [wrongFile] } });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/file type|png|jpeg/i));
    });
    expect(apiClient.post).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
