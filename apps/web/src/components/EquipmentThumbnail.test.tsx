import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EquipmentThumbnail from './EquipmentThumbnail';

describe('EquipmentThumbnail', () => {
  it('renders the image when a URL is provided', () => {
    render(
      <EquipmentThumbnail
        url="https://cdn.example.com/profile.jpg"
        name="Walk-in Freezer"
      />
    );
    const img = screen.getByAltText('Walk-in Freezer') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.example.com/profile.jpg');
  });

  it('falls back to a placeholder icon when url is null', () => {
    render(<EquipmentThumbnail url={null} name="Walk-in Freezer" />);
    expect(screen.queryByAltText('Walk-in Freezer')).not.toBeInTheDocument();
    // The placeholder icon carries the equipment name as its aria-label.
    expect(screen.getByLabelText('Walk-in Freezer')).toBeInTheDocument();
  });

  it('falls back to a placeholder icon when url is omitted', () => {
    render(<EquipmentThumbnail name="Walk-in Freezer" />);
    expect(screen.queryByAltText('Walk-in Freezer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Walk-in Freezer')).toBeInTheDocument();
  });

  it('renders a type-derived monogram when monogram is on and there is no url', () => {
    render(<EquipmentThumbnail monogram type="Condenser" name="Upstairs condenser" />);
    // The monogram tile is an accessible image labelled by the name...
    expect(screen.getByRole('img', { name: 'Upstairs condenser' })).toBeInTheDocument();
    // ...with the type's initials as the glyph (one word → first two letters).
    expect(screen.getByText('CO')).toBeInTheDocument();
    // Not the neutral icon placeholder.
    expect(screen.queryByAltText('Upstairs condenser')).not.toBeInTheDocument();
  });

  it('derives the monogram from the name when no type is given (two words → both initials)', () => {
    render(<EquipmentThumbnail monogram name="Water Heater" />);
    expect(screen.getByText('WH')).toBeInTheDocument();
  });

  it('shows the photo, not a monogram, when a url is present', () => {
    render(
      <EquipmentThumbnail monogram type="Condenser" url="https://cdn.example.com/eq.jpg" name="Upstairs condenser" />
    );
    expect(screen.getByAltText('Upstairs condenser')).toBeInTheDocument();
    expect(screen.queryByText('CO')).not.toBeInTheDocument();
  });
});
