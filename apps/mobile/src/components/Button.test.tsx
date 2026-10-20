import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Button } from './Button';

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderButton = (props: Partial<React.ComponentProps<typeof Button>> = {}) =>
  render(
    <ThemeProvider>
      <Button label="Call site" onPress={jest.fn()} {...props} />
    </ThemeProvider>
  );

describe('Button', () => {
  it('renders the supplied label', async () => {
    await renderButton();
    expect(screen.getByText('Call site')).toBeTruthy();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress });
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('marks itself disabled to assistive tech and ignores presses', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, disabled: true });
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost'] as const)(
    'renders the %s variant without crashing',
    async (variant) => {
      await renderButton({ variant });
      expect(screen.getByText('Call site')).toBeTruthy();
    }
  );
});
