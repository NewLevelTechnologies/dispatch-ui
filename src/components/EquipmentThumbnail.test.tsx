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
});
