import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import { CustomerResultRow } from './CustomerResultRow';

describe('CustomerResultRow', () => {
  it('shows name, full address, singular location count and id', () => {
    renderWithProviders(
      <CustomerResultRow
        name="Paul Wilcox"
        customerNumber="C-1442"
        addressLine="1942 Lenox Rd NE, Atlanta GA"
        locationCount={1}
      />
    );
    expect(screen.getByText('Paul Wilcox')).toBeInTheDocument();
    expect(screen.getByText('1942 Lenox Rd NE, Atlanta GA')).toBeInTheDocument();
    expect(screen.getByText('1 location')).toBeInTheDocument();
    expect(screen.getByText('C-1442')).toBeInTheDocument();
  });

  it('pluralizes the location count', () => {
    renderWithProviders(<CustomerResultRow name="Joe's Pizza" locationCount={3} />);
    expect(screen.getByText('3 locations')).toBeInTheDocument();
  });

  it('flags a payer instead of showing a location count', () => {
    renderWithProviders(<CustomerResultRow name="Acme Warranty Co" locationCount={0} isPayer />);
    expect(screen.getByText('Payer')).toBeInTheDocument();
    expect(screen.queryByText(/location/)).not.toBeInTheDocument();
  });
});
