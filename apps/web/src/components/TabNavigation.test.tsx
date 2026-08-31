import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '../test/utils';
import TabNavigation from './TabNavigation';

describe('TabNavigation', () => {
  const mockTabs = [
    { id: 'overview', label: 'Overview', count: undefined },
    { id: 'work-orders', label: 'Work Orders', count: 5 },
    { id: 'equipment', label: 'Equipment', count: 0 },
    { id: 'activity', label: 'Activity', count: undefined },
  ];

  it('renders all tabs', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="overview" onTabChange={onTabChange} />);

    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /work orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /equipment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument();
  });

  it('displays count badges when provided', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="overview" onTabChange={onTabChange} />);

    // Work Orders tab should show count of 5
    const workOrdersTab = screen.getByRole('button', { name: /work orders/i });
    expect(workOrdersTab).toHaveTextContent('5');

    // Equipment tab should show count of 0
    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    expect(equipmentTab).toHaveTextContent('0');
  });

  it('does not display count badges when count is undefined', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="overview" onTabChange={onTabChange} />);

    // Overview and Activity should not have count badges
    const overviewTab = screen.getByRole('button', { name: /^overview$/i });
    expect(overviewTab.textContent).toBe('Overview');

    const activityTab = screen.getByRole('button', { name: /^activity$/i });
    expect(activityTab.textContent).toBe('Activity');
  });

  it('marks active tab with aria-current', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="work-orders" onTabChange={onTabChange} />);

    const workOrdersTab = screen.getByRole('button', { name: /work orders/i });
    expect(workOrdersTab).toHaveAttribute('aria-current', 'page');

    const overviewTab = screen.getByRole('button', { name: /overview/i });
    expect(overviewTab).not.toHaveAttribute('aria-current');
  });

  it('calls onTabChange when tab is clicked', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    render(<TabNavigation tabs={mockTabs} activeTab="overview" onTabChange={onTabChange} />);

    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    expect(onTabChange).toHaveBeenCalledWith('equipment');
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it('applies different styling to active and inactive tabs', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="activity" onTabChange={onTabChange} />);

    const activeTab = screen.getByRole('button', { name: /activity/i });
    const inactiveTab = screen.getByRole('button', { name: /overview/i });

    // Active tab should have zinc-950 color classes (Catalyst style)
    expect(activeTab.className).toContain('border-zinc-950');
    expect(activeTab.className).toContain('text-zinc-950');

    // Inactive tab should have transparent border
    expect(inactiveTab.className).toContain('border-transparent');
    expect(inactiveTab.className).toContain('text-zinc-500');
  });

  it('applies different badge styling to active and inactive tabs', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation tabs={mockTabs} activeTab="work-orders" onTabChange={onTabChange} />);

    const workOrdersTab = screen.getByRole('button', { name: /work orders/i });
    const equipmentTab = screen.getByRole('button', { name: /equipment/i });

    // Active tab badge should have zinc-950/10 background (Catalyst style)
    const activeBadge = workOrdersTab.querySelector('span');
    expect(activeBadge?.className).toContain('bg-zinc-950/10');

    // Inactive tab badge should have zinc background
    const inactiveBadge = equipmentTab.querySelector('span');
    expect(inactiveBadge?.className).toContain('bg-zinc-100');
  });
});
