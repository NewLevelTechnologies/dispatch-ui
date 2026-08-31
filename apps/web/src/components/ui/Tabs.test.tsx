import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, ViewTabs } from './Tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'items', label: 'Work items', count: 2 },
  { id: 'trips', label: 'Trips', count: 3 },
];

describe('Tabs', () => {
  it('renders one tab per entry', () => {
    render(<Tabs value="overview" onChange={vi.fn()} tabs={TABS} />);
    expect(screen.getAllByRole('tab').length).toBe(3);
  });

  it('marks the selected tab via aria-selected', () => {
    render(<Tabs value="items" onChange={vi.fn()} tabs={TABS} />);
    expect(screen.getByRole('tab', { name: /Work items/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('renders count badges when provided', () => {
    render(<Tabs value="overview" onChange={vi.fn()} tabs={TABS} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('fires onChange with the selected tab id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="overview" onChange={onChange} tabs={TABS} />);
    await user.click(screen.getByRole('tab', { name: /Trips/ }));
    expect(onChange).toHaveBeenCalledWith('trips');
  });

  it('forwards className to the tablist', () => {
    const { container } = render(
      <Tabs value="overview" onChange={vi.fn()} tabs={TABS} className="extra" />,
    );
    expect(container.querySelector('.tab-row.extra')).toBeInTheDocument();
  });
});

const VIEW_TABS = [
  { id: 'open', label: 'Open', count: 38 },
  { id: 'urgent', label: 'Urgent', count: 4, tone: 'danger' as const },
  { id: 'today', label: 'Today', count: 14, tone: 'info' as const },
];

describe('ViewTabs', () => {
  it('renders one tab per entry with the tone dot on toned tabs', () => {
    const { container } = render(
      <ViewTabs value="open" onChange={vi.fn()} tabs={VIEW_TABS} />,
    );
    expect(screen.getAllByRole('tab').length).toBe(3);
    // 2 toned tabs each render a dot span; Open has no tone so 2 total
    expect(container.querySelectorAll('.rounded-full').length).toBe(2);
  });

  it('marks the selected view via aria-selected and active class', () => {
    render(<ViewTabs value="urgent" onChange={vi.fn()} tabs={VIEW_TABS} />);
    const tab = screen.getByRole('tab', { name: /Urgent/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab.className).toContain('active');
  });

  it('fires onChange when a view is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewTabs value="open" onChange={onChange} tabs={VIEW_TABS} />);
    await user.click(screen.getByRole('tab', { name: /Today/ }));
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('renders the count chip for each view', () => {
    render(<ViewTabs value="open" onChange={vi.fn()} tabs={VIEW_TABS} />);
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('falls back to the muted tone dot color when tone is unknown', () => {
    const { container } = render(
      <ViewTabs
        value="x"
        onChange={vi.fn()}
        tabs={[
          // Cast through unknown to feed an out-of-range tone for the fallback path
          { id: 'x', label: 'X', tone: 'mystery' as unknown as 'info' },
        ]}
      />,
    );
    const dot = container.querySelector('.rounded-full') as HTMLElement;
    expect(dot).toBeInTheDocument();
    expect(dot.style.background).toContain('var(--fg-dim)');
  });
});
