import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DispatchRow } from './DispatchRow';

const BASE_PROPS = {
  time: '8:00a',
  title: 'Johnson Residence',
  subtitle: 'No cool · HVAC · 2.1 mi',
  statusLabel: 'En route',
  statusTone: 'accent' as const,
};

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderRow = (props: Partial<React.ComponentProps<typeof DispatchRow>> = {}) =>
  render(
    <ThemeProvider>
      <DispatchRow {...BASE_PROPS} {...props} />
    </ThemeProvider>
  );

describe('DispatchRow', () => {
  it('renders time, title, subtitle and status', async () => {
    await renderRow();
    expect(screen.getByText('8:00a')).toBeTruthy();
    expect(screen.getByText('Johnson Residence')).toBeTruthy();
    expect(screen.getByText('No cool · HVAC · 2.1 mi')).toBeTruthy();
    expect(screen.getByText('En route')).toBeTruthy();
  });

  it('omits the action icons when no handlers are given', async () => {
    await renderRow();
    expect(screen.queryByLabelText('Call')).toBeNull();
    expect(screen.queryByLabelText('Directions')).toBeNull();
  });

  it('calls onPressCall and onPressDirections independently of the row press', async () => {
    const onPress = jest.fn();
    const onPressCall = jest.fn();
    const onPressDirections = jest.fn();
    await renderRow({ onPress, onPressCall, onPressDirections });

    await fireEvent.press(screen.getByLabelText('Call'));
    expect(onPressCall).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Directions'));
    expect(onPressDirections).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('calls onPress when the row itself is tapped', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress });
    await fireEvent.press(screen.getByText('Johnson Residence'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
