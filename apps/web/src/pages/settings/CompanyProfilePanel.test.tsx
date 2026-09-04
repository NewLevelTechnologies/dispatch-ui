import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import CompanyProfilePanel from './CompanyProfilePanel';
import { apiClient } from '../../api/setup';
import { showError, showSuccess } from '../../lib/toast';

vi.mock('@dispatch/api/src/client');
vi.mock('../../contexts/TenantContext', () => ({
  useOptionalTenant: () => ({
    activeMembership: {
      tenantId: 't1',
      tenantSlug: 'acme-hvac',
      companyName: 'Acme Ops',
      userId: 'u1',
    },
  }),
}));
// Keep extractApiError real (the load-error Callout depends on it); spy on the
// toast lanes so we can assert success/error feedback.
vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

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
  enableExternalNotifications: true,
  enableAiFeatures: true,
  defaultPremiseType: 'BUSINESS',
  glossary: {},
  updatedAt: '2026-03-27T10:30:00Z',
};

const mockSettingsWithLogo = {
  ...mockSettings,
  logoOriginalUrl: 'https://x/acme-logo.png',
  logoThumbnailUrl: 'https://x/acme-logo-thumb.png',
};

// Editable cards each have their own Edit button. Targeted by card title
// rather than by index: the index mapping silently retargeted every one of
// these tests when a card was added above Identity, and the failure surfaced
// as "cannot find the company name field" rather than as "wrong card".
//
// The "Features & preferences" card is flip-in-place (no Edit button), so its
// toggles are targeted by switch aria-label instead.
const editButtonFor = (cardTitle: string) => {
  // Walks up from the card's title to the nearest ancestor that contains an
  // Edit button, which is that card's own. Card renders its title as a plain
  // div rather than a heading, and its root has no test-friendly hook — so
  // this avoids hard-coding either the markup depth or a class name.
  let node: HTMLElement | null = screen.getByText(cardTitle);
  while (node) {
    const button = within(node).queryByRole('button', {
      name: /^(edit|complete identity)$/i,
    });
    if (button) return button;
    node = node.parentElement;
  }
  throw new Error(`No Edit button found for the "${cardTitle}" card`);
};

describe('CompanyProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings });
  });

  it('renders heading and identity values in view mode', async () => {
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /company profile/i })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Comfort First')).toBeInTheDocument();
    expect(screen.getByText(/123 Main/)).toBeInTheDocument();
    expect(screen.getByText(/Springfield, IL 62701/)).toBeInTheDocument();
    expect(screen.getByText('info@acme.com')).toBeInTheDocument();
  });

  it('shows the workspace name from the membership list, not from settings', async () => {
    // The switcher renders the membership list's companyName, so this card has
    // to edit that same string — tenant-settings.companyName is the separate
    // customer-facing name below it.
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Workspace name')).toBeInTheDocument());
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('renames the workspace through its own endpoint and refreshes the switcher', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { companyName: 'Atech' } });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Workspace'));
    const input = screen.getByDisplayValue('Acme Ops');
    await user.clear(input);
    await user.type(input, 'Atech');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      // Its own endpoint, and no status or tenant id in the body — neither is
      // expressible on the self-service path.
      expect(apiClient.put).toHaveBeenCalledWith('/tenant/tenants/me', {
        companyName: 'Atech',
      });
    });
    expect(showSuccess).toHaveBeenCalledWith('Workspace name updated');
  });

  it('renders the reporting timezone with human label and IANA zone', async () => {
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    expect(screen.getByText('Reporting timezone')).toBeInTheDocument();
    expect(screen.getByText('Central Time')).toBeInTheDocument();
    expect(screen.getByText('America/Chicago')).toBeInTheDocument();
  });

  it('renders the branding empty state when no logo is set', async () => {
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    expect(screen.getByText(/No logo set yet/i)).toBeInTheDocument();
  });

  it('does not show cut surfaces (Business Defaults, Modules & Features, tax rate)', async () => {
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    expect(screen.queryByText(/Business Defaults/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Modules & Features/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Tax Rate/i)).not.toBeInTheDocument();
  });

  it('edits Identity and reverts on Cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Identity'));
    expect(screen.getByDisplayValue('Acme HVAC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    const cityInput = screen.getByDisplayValue('Springfield');
    await user.clear(cityInput);
    await user.type(cityInput, 'Shelbyville');

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // Back in view mode with the original value.
    expect(screen.getByText(/Springfield, IL 62701/)).toBeInTheDocument();
  });

  it('saves Identity with the modified company name', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockSettings, companyName: 'New Name' } });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Identity'));
    const nameInput = screen.getByDisplayValue('Acme HVAC');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ companyName: 'New Name' }),
      );
    });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('saves the reporting timezone independently', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, timezone: 'America/New_York' },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Operating'));
    const tzSelect = screen.getByRole('combobox');
    await user.selectOptions(tzSelect, 'America/New_York');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ timezone: 'America/New_York' }),
      );
    });
  });

  it('saves the default premise type for new locations', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, defaultPremiseType: 'RESIDENCE' },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Operating'));
    await user.click(screen.getByRole('radio', { name: /residence/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ defaultPremiseType: 'RESIDENCE' }),
      );
    });
    // Timezone was untouched, so the partial PUT must not include it.
    expect(apiClient.put).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ timezone: expect.anything() }),
    );
  });

  // ── Features & preferences card (consolidated flip-in-place toggles) ──

  it('shows the revenue-recognition toggle Off by default with no Configure link', async () => {
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    // mockSettings carries no recognition fields → treated as off.
    expect(screen.getByRole('switch', { name: /revenue recognition/i })).not.toBeChecked();
    expect(screen.queryByText(/configure basis/i)).not.toBeInTheDocument();
  });

  it('flips revenue recognition on in place and persists immediately (no Edit→Save)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, revenueRecognitionEnabled: true },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: /revenue recognition/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ revenueRecognitionEnabled: true }),
      );
    });
    // Partial PUT — only the flipped field.
    expect(apiClient.put).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ timezone: expect.anything() }),
    );
  });

  it('configures the recognition basis from a dialog when recognition is on', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockSettings, revenueRecognitionEnabled: true, revenueRecognitionBasis: 'STRAIGHT_LINE' },
    });
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, revenueRecognitionEnabled: true, revenueRecognitionBasis: 'PER_VISIT' },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    // The link surfaces the active basis and opens the basis dialog.
    await user.click(screen.getByRole('button', { name: /configure basis/i }));
    await user.click(screen.getByRole('radio', { name: /per-visit/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ revenueRecognitionBasis: 'PER_VISIT' }),
      );
    });
  });

  it('flips AI features in place and persists only that field', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, enableAiFeatures: false },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    // Default mock has AI on → clicking flips it off.
    await user.click(screen.getByRole('switch', { name: /ai features/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ enableAiFeatures: false }),
      );
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ timezone: expect.anything() }),
    );
  });

  it('confirms before turning external notifications OFF, then persists', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, enableExternalNotifications: false },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    // Default mock has notifications on → flipping off opens a confirm first.
    await user.click(screen.getByRole('switch', { name: /^notifications$/i }));
    expect(screen.getByText(/turn off external notifications\?/i)).toBeInTheDocument();
    // Nothing persists until confirmed.
    expect(apiClient.put).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^turn off$/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ enableExternalNotifications: false }),
      );
    });
  });

  it('turns external notifications ON in place without a confirm', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockSettings, enableExternalNotifications: false },
    });
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { ...mockSettings, enableExternalNotifications: true },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: /^notifications$/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({ enableExternalNotifications: true }),
      );
    });
    expect(screen.queryByText(/turn off external notifications\?/i)).not.toBeInTheDocument();
  });

  it('surfaces a warning in view mode when external notifications are off', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...mockSettings, enableExternalNotifications: false },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());
    expect(screen.getByText(/aren't receiving any notifications/i)).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<CompanyProfilePanel />);
    // LoadingState has a 250 ms delay before becoming visible.
    expect(await screen.findByText(/loading settings/i)).toBeInTheDocument();
  });

  it('surfaces the API error message on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Token expired' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load company profile")).toBeInTheDocument();
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  it('uploads a valid logo on Save', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { message: 'ok', urls: { original: 'https://x/logo.png' } },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Branding'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const goodFile = new File(['x'], 'logo.png', { type: 'image/png' });
    await user.upload(fileInput, goodFile);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
  });

  it('rejects a logo larger than 1MB without uploading', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Branding'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(2 * 1024 * 1024)], 'logo.png', { type: 'image/png' });
    await user.upload(fileInput, bigFile);

    expect(showError).toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('does not offer Remove when no logo is set', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Branding'));
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it('removes a saved logo on Save via DELETE', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettingsWithLogo });
    vi.mocked(apiClient.delete).mockResolvedValue({
      data: { ...mockSettingsWithLogo, logoOriginalUrl: null, logoThumbnailUrl: null },
    });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Branding'));
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(screen.getByText(/logo will be removed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(expect.stringContaining('/tenant-settings/logo'));
    });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('backs out of a staged removal with Keep current logo', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettingsWithLogo });
    renderWithProviders(<CompanyProfilePanel />);
    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeInTheDocument());

    await user.click(editButtonFor('Branding'));
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(screen.getByText(/logo will be removed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep current logo/i }));
    expect(screen.queryByText(/logo will be removed/i)).not.toBeInTheDocument();
    expect(apiClient.delete).not.toHaveBeenCalled();
  });
});
